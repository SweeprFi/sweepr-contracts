# SWEEP Coin and Stabilizer Contracts

This repo contains all the contracts for SWEEP Coin.
It also contains the Stabilizer's implementation.

### Instalation:

```
git clone https://github.com/SweeprFi/sweepr-contracts.git
cd sweepr-contracts
cp .env.example .env
npm install
forge install
```

### Compile the contracts
```
npx hardhat compile
```

### Deploy and Verify:
Repeat this for every file in the scripts folder:
```
npx hardhat run --network [your-network] scripts/deploy_N_[script].js
```
Store the output addresses in the .env file

### Coverge
The CHAIN_ID in the .env must be 42161 to fork Arbitrum One
```
npx hardhat coverage
```
Next, open ```index.html`` from coverage/ in browser

### Run the tests with Hardhat:
The CHAIN_ID in the .env must be 42161 to fork Arbitrum One
```
npx hardhat test --network hardhat
```

### Run the tests with Foundry
The RPC_URL must be the Alchemy Arbitrum One
```
forge test -vv --fork-url ${RPC_URL}
```