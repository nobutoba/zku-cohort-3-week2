# Create a Node.js project
mkdir semaphore-example
cd semaphore-example
yarn init -y

# Install Hardhat
yarn add hardhat --dev
yarn hardhat

# Install Semaphore contracts and ZK-kit
yarn add @appliedzkp/semaphore-contracts
yarn add @zk-kit/identity @zk-kit/protocols --dev

# Create a Hardhat task that deploys your contract
yarn add @zk-kit/incremental-merkle-tree circomlibjs@0.0.8 --dev
yarn add hardhat-dependency-compiler --dev

# Test your smart contract
yarn add -D @nomiclabs/hardhat-waffle 'ethereum-waffle@^3.0.0' \
   @nomiclabs/hardhat-ethers 'ethers@^5.0.0' chai
