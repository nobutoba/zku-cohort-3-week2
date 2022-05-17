# Create a Node.js project
mkdir semaphore-example
cd semaphore-example
yarn init -y

# Install Hardhat
yarn add hardhat --dev
yarn hardhat
# Choose "Create a basic sample project" and hit enter to all questions that follow

# Install Semaphore contracts and ZK-kit
yarn add @appliedzkp/semaphore-contracts
yarn add @zk-kit/identity @zk-kit/protocols --dev
