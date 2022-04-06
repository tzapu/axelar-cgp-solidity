'use strict';

require('dotenv').config();

const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const gatewayAddress = process.env.GATEWAY_ADDRESS;

const IAxelarGateway = require('./build/IAxelarGateway.json');
const IERC20 = require('./build/IERC20.json');
const Erc20Hub = require('./build/ERC20Hub.json');
const {
  Contract,
  ContractFactory,
  Wallet,
  providers: { JsonRpcProvider },
  constants: { MaxUint256 },
} = require('ethers');

const destinationChain = 'ethereum-3';
const destinationAddress = Wallet.createRandom().address;
const payload = Buffer.from([0x62, 0x75, 0x66, 0x66, 0x65, 0x72]);
const symbol = 'uaxl-1';
const amount = 10000000;

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);
const gateway = new Contract(gatewayAddress, IAxelarGateway.abi, wallet);

new ContractFactory(Erc20Hub.abi, Erc20Hub.bytecode, wallet)
  .deploy()
  .then((erc20Hub) => erc20Hub.deployed())
  .then(async (erc20Hub) => {
    const tokenAddress = await gateway.tokenAddresses(symbol);
    const token = new Contract(tokenAddress, IERC20.abi, wallet);
    await token.approve(erc20Hub.address, MaxUint256).then((tx) => tx.wait());

    return erc20Hub.callGateway(
      gatewayAddress,
      destinationChain,
      destinationAddress,
      payload,
      symbol,
      amount,
    );
  })
  .then((tx) => tx.wait())
  .then(console.log)
  .catch(console.error);
