# SWEEP Coin and Stabilizer Contracts

This repo contains all the contracts for SWEEP Coin.
It also contains the Stabilizer's implementation.

### Instalation:

```
git clone https://github.com/SweeprFi/sweepr-contracts.git
cd sweepr-contracts
cp .env.example .env
npm install
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

### Run the tests:
The CHAIN_ID in the .env must be 42161 to fork Arbitrum One
```
npx hardhat coverage
```
or
```
npx hardhat test --network hardhat
```
