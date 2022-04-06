'use strict';

require('dotenv').config();

const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const gatewayAddress = process.env.GATEWAY_ADDRESS;

const IAxelarGateway = require('./build/IAxelarGateway.json');
const IERC20 = require('./build/IERC20.json');
const {
  Contract,
  Wallet,
  providers: { JsonRpcProvider },
  constants: { MaxUint256 },
} = require('ethers');

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);
const gateway = new Contract(gatewayAddress, IAxelarGateway.abi, wallet);

const symbol = 'ethereum-1-uaxl';

gateway
  .tokenAddresses(symbol)
  .then((tokenAddress) => {
    const token = new Contract(tokenAddress, IERC20.abi, wallet);

    return token.approve(gateway.address, MaxUint256);
  })
  .then(() =>
    gateway.sendToken(
      'ethereum-2',
      Wallet.createRandom().address,
      symbol,
      10000000,
    ),
  )
  .then((tx) => tx.wait())
  .then(console.log)
  .catch(console.error);
