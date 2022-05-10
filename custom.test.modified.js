// [assignment] please copy the entire modified custom.test.js here
const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
      // [assignment] complete code here
      //    - Alice deposits 0.1 ETH in L1
      //    - Alice withdraws 0.08 ETH in L2
      //    - assert alice, omniBridge, and tornadoPool balances are correct
      const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
      const aliceAddress = '0xDeaD00000000000000000000000000000000BEEf'

      // a function logging relevant balances
      async function logBalances(explanation) {
        const contracts = [tornadoPool, omniBridge]
        let balances = []
        for (const contract of contracts) {
          const balance = await token.balanceOf(contract.address)
          balances.push((balance/(10**18)).toString())
        }
        const aliceBalance = await token.balanceOf(aliceAddress)
        balances.push((aliceBalance/10**18).toString())
        console.log("\t[tornadoPool, omniBridge, alice] =", balances, explanation)
      }
      // [tornadoPool, omniBridge, alice] = [ '0', '0', '0' ] at first
      await logBalances("at first")

      // Alice deposits 0.1 ETH into tornadoPool through omniBridge
      const aliceDepositAmount = utils.parseEther('0.1')
      const aliceKeypair = new Keypair()

      // Step 1. transfer tokens to omniBridge
      await token.transfer(omniBridge.address, aliceDepositAmount)
      // [tornadoPool, omniBridge, alice] = [ '0', '0.1', '0' ] after token.transfer
      await logBalances("after token.transfer")

      // Step 2. omniBridge sends tokens to tornadoPool
      const transferTx = await token.populateTransaction.transfer(
        tornadoPool.address,
        aliceDepositAmount,
        )
        await omniBridge.execute([
          { who: token.address, callData: transferTx.data }, // send tokens to pool
        ])
        // [tornadoPool, omniBridge, alice] = [ '0.1', '0', '0' ] after omniBridge.execute1
        await logBalances("after omniBridge.execute1")

      // Step 3. omniBridge calls onTokenBridgedTx
      const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
      const { args, extData } = await prepareTransaction({
        tornadoPool,
        outputs: [aliceDepositUtxo],
      })
      const onTokenBridgedData = encodeDataForBridge({
        proof: args,
        extData,
      })
      const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address,
        aliceDepositUtxo.amount,
        onTokenBridgedData,
      )
      await omniBridge.execute([
          { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
      ])
      // [tornadoPool, omniBridge, alice] = [ '0.1', '0', '0' ] after omniBridge.execute2
      await logBalances("after omniBridge.execute2")

      // Alice withdraws 0.08 ETH in L2
      const aliceWithdrawAmount = utils.parseEther('0.08')
      const aliceChangeUtxo = new Utxo({
        amount: aliceDepositAmount.sub(aliceWithdrawAmount),
        keyPair: aliceKeypair,
      })
      await transaction({
        tornadoPool,
        inputs: [aliceDepositUtxo],
        outputs: [aliceChangeUtxo],
        recipient: aliceAddress,
      })
      // [tornadoPool, omniBridge, alice] = [ '0.02', '0', '0.08' ] after transaction
      await logBalances("after transaction")

      // assert alice, omniBridge, and tornadoPool balances are correct
      const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
      expect(tornadoPoolBalance).to.be.equal(aliceDepositAmount.sub(aliceWithdrawAmount))
      const omniBridgeBalance = await token.balanceOf(omniBridge.address)
      expect(omniBridgeBalance).to.be.equal(0)
      const aliceBalance = await token.balanceOf(aliceAddress)
      expect(aliceBalance).to.be.equal(aliceWithdrawAmount)
    })

    it('[assignment] iii. see assignment doc for details', async () => {
      // [assignment] complete code here
      //    - Alice deposits 0.13 ETH in L1
      //    - Alice sends 0.06 ETH to Bob in L2
      //    - Bob withdraws all his funds in L2
      //    - Alice withdraws all her remaining funds in L1
      //    - assert all relevant balances are correct
      const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
      const bobAddress = '0xDeaD00000000000000000000000000000000BEEf'

      // a function logging relevant balances
      async function logBalances(explanation) {
        const contracts = [tornadoPool, omniBridge]
        let balances = []
        for (const contract of contracts) {
          const balance = await token.balanceOf(contract.address)
          balances.push((balance/(10**18)).toString())
        }
        const bobBalance = await token.balanceOf(bobAddress)
        balances.push(bobBalance/(10**18).toString())
        console.log("\t[tornadoPool, omniBridge, bob] =", balances, explanation)
      }
      // [tornadoPool, omniBridge, bob] = [ '0', '0', 0 ] at first
      await logBalances("at first")

      // Alice deposits 0.13 ETH into tornadoPool through omniBridge
      const aliceDepositAmount = utils.parseEther('0.13')
      const aliceKeypair = new Keypair()

      // Step 1. transfer tokens to omniBridge
      await token.transfer(omniBridge.address, aliceDepositAmount)
      // [tornadoPool, omniBridge, bob] = [ '0', '0.13', 0 ] after token.transfer
      await logBalances("after token.transfer")

      // Step 2. omniBridge sends tokens to tornadoPool
      const transferTx = await token.populateTransaction.transfer(
        tornadoPool.address,
        aliceDepositAmount,
        )
        await omniBridge.execute([
        { who: token.address, callData: transferTx.data }, // send tokens to pool
      ])
      // [tornadoPool, omniBridge, bob] = [ '0.13', '0', 0 ] after omniBridge.execute1
      await logBalances("after omniBridge.execute1")

      // Step 3. omniBridge calls onTokenBridgedTx
      const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
      const { args, extData } = await prepareTransaction({
        tornadoPool,
        outputs: [aliceDepositUtxo],
      })
      const onTokenBridgedData = encodeDataForBridge({
        proof: args,
        extData,
      })
      const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address,
        aliceDepositUtxo.amount,
        onTokenBridgedData,
      )
      await omniBridge.execute([
          { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
      ])
      // [tornadoPool, omniBridge, bob] = [ '0.13', '0', 0 ] after omniBridge.execute2
      await logBalances("after omniBridge.execute2")

      // Alice sends 0.06 ETH to Bob
      const bobSendAmount = utils.parseEther('0.06')
      const bobKeypair = new Keypair() // contains private and public keys
      const bobKeypairPublic = Keypair.fromString(bobKeypair.address()) // contains only public key
      const bobSendUtxo = new Utxo({
        amount: bobSendAmount,
        keyPair: bobKeypairPublic,
      })
      const aliceChangeUtxo = new Utxo({
        amount: aliceDepositAmount.sub(bobSendAmount),
        keypair: aliceDepositUtxo.keypair,
      })
      await transaction({
        tornadoPool,
        inputs: [aliceDepositUtxo],
        outputs: [bobSendUtxo, aliceChangeUtxo],
      })
      // [tornadoPool, omniBridge, bob] = [ '0.13', '0', 0 ] after transaction
      await logBalances("after transaction")

      // Bob parses chain to detect incoming funds
      // const filter = tornadoPool.filters.NewCommitment()
      // const fromBlock = await ethers.provider.getBlock()
      // const events = await tornadoPool.queryFilter(filter, fromBlock.number)
      // let bobReceiveUtxo
      // try {
      //   bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[0].args.encryptedOutput, events[0].args.index)
      // } catch (e) {
      //   // we try to decrypt another output here because it shuffles outputs before sending to blockchain
      //   bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[1].args.encryptedOutput, events[1].args.index)
      // }
      // expect(bobReceiveUtxo.amount).to.be.equal(bobSendAmount)

      // Bob withdraws all his funds
      await transaction({
        tornadoPool,
        inputs: [bobSendUtxo],
        recipient: bobAddress,
      })
      // [tornadoPool, omniBridge, bob] = [ '0.07', '0', 0.06 ] after transaction
      await logBalances("after transaction")

      // Alice withdraws all her remaining funds
      await transaction({
        tornadoPool,
        inputs: [aliceChangeUtxo],
        recipient: bobAddress,
        isL1Withdrawal: true,
      })
      // [tornadoPool, omniBridge, bob] = [ '0', '0.07', 0.06 ] after transaction
      await logBalances("after transaction")

      // assert all relevant balances are correct
      const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
      expect(tornadoPoolBalance).to.be.equal(0)
      const omniBridgeBalance = await token.balanceOf(omniBridge.address)
      expect(omniBridgeBalance).to.be.equal(aliceDepositAmount.sub(bobSendAmount))
      const bobBalance = await token.balanceOf(bobAddress)
      expect(bobBalance).to.be.equal(bobSendAmount)
    })
})
