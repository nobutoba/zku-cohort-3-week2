const { Strategy, ZkIdentity } = require("@zk-kit/identity")
const { generateMerkleProof, Semaphore } = require("@zk-kit/protocols")
const identityCommitments = require("../static/identityCommitments.json")
const { expect } = require("chai")
const { run, ethers } = require("hardhat")

describe("Greeters", function () {
   let contract
   let signers

   before(async () => {
       contract = await run("deploy", { logs: false })

       signers = await ethers.getSigners()
   })

   describe("# greet", () => {
       const wasmFilePath = "./static/semaphore.wasm"
       const finalZkeyPath = "./static/semaphore_final.zkey"

       it("Should greet", async () => {
           const message = await signers[0].signMessage("Sign this message to create your identity!")

           const identity = new ZkIdentity(Strategy.MESSAGE, message)
           const identityCommitment = identity.genIdentityCommitment()
           const greeting = "Hello world"
           const bytes32Greeting = ethers.utils.formatBytes32String(greeting)

           const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)
           const witness = Semaphore.genWitness(
               identity.getTrapdoor(),
               identity.getNullifier(),
               merkleProof,
               merkleProof.root,
               greeting
           )

           const fullProof = await Semaphore.genProof(witness, wasmFilePath, finalZkeyPath)
           const solidityProof = Semaphore.packToSolidityProof(fullProof.proof)

           const nullifierHash = Semaphore.genNullifierHash(merkleProof.root, identity.getNullifier())

           const transaction = contract.greet(bytes32Greeting, nullifierHash, solidityProof)

           await expect(transaction).to.emit(contract, "NewGreeting").withArgs(bytes32Greeting)
       })
   })
})
