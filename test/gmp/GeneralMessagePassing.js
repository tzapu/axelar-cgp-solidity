'use strict';

const chai = require('chai');
const {
    Contract,
    ContractFactory,
    utils: { defaultAbiCoder, arrayify, keccak256 },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;
const { get } = require('lodash/fp');
const { deployUpgradable } = require('../../scripts/upgradable');

const CHAIN_ID = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const Auth = require('../../artifacts/contracts/auth/AxelarAuthWeighted.sol/AxelarAuthWeighted.json');
const TokenDeployer = require('../../artifacts/contracts/TokenDeployer.sol/TokenDeployer.json');
const AxelarGatewayProxy = require('../../artifacts/contracts/AxelarGatewayProxy.sol/AxelarGatewayProxy.json');
const AxelarGateway = require('../../artifacts/contracts/AxelarGateway.sol/AxelarGateway.json');
const MintableCappedERC20 = require('../../artifacts/contracts/MintableCappedERC20.sol/MintableCappedERC20.json');
const GasService = require('../../artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json');
const GasServiceProxy = require('../../artifacts/contracts/gas-service/AxelarGasServiceProxy.sol/AxelarGasServiceProxy.json');
const GMPExpressService = require('../../artifacts/contracts/gmp-express/GMPExpressService.sol/GMPExpressService.json');
const GMPExpressServiceProxy = require('../../artifacts/contracts/gmp-express/GMPExpressServiceProxy.sol/GMPExpressServiceProxy.json');
const SourceChainSwapCaller = require('../../artifacts/contracts/test/gmp/SourceChainSwapCaller.sol/SourceChainSwapCaller.json');
const DestinationChainSwapExecutable = require('../../artifacts/contracts/test/gmp/DestinationChainSwapExecutable.sol/DestinationChainSwapExecutable.json');
const ExpressExecutableProxy = require('../../artifacts/@axelar-network/axelar-gmp-sdk-solidity/contracts/express/ExpressExecutableProxy.sol/ExpressExecutableProxy.json');
const ExpressRegistry = require('../../artifacts/@axelar-network/axelar-gmp-sdk-solidity/contracts/express/ExpressRegistry.sol/ExpressRegistry.json');
const DestinationChainSwapExpress = require('../../artifacts/contracts/test/gmp/DestinationChainSwapExpress.sol/DestinationChainSwapExpress.json');
const DestinationChainTokenSwapper = require('../../artifacts/contracts/test/gmp/DestinationChainTokenSwapper.sol/DestinationChainTokenSwapper.json');
const ConstAddressDeployer = require('@axelar-network/axelar-gmp-sdk-solidity/dist/ConstAddressDeployer.json');

const { getWeightedAuthDeployParam, getSignedWeightedExecuteInput, getRandomID } = require('../utils');
const { predictContractConstant } = require('@axelar-network/axelar-gmp-sdk-solidity');

describe('GeneralMessagePassing', () => {
    const [ownerWallet, operatorWallet, userWallet, adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6] =
        new MockProvider().getWallets();
    const adminWallets = [adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6];
    const threshold = 3;

    let sourceChainGateway;
    let destinationChainGateway;
    let gmpExpressService;
    let gasService;
    let sourceChainSwapCaller;
    let destinationChainSwapExecutable;
    let destinationChainSwapExpress;
    let destinationChainExpressRegistry;
    let destinationChainTokenSwapper;
    let tokenA;
    let tokenB;

    const sourceChain = 'chainA';
    const destinationChain = 'chainB';
    const nameA = 'testTokenX';
    const symbolA = 'testTokenX';
    const nameB = 'testTokenY';
    const symbolB = 'testTokenY';
    const decimals = 16;
    const capacity = 0;

    const getMintData = (symbol, address, amount) =>
        arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                    CHAIN_ID,
                    [getRandomID()],
                    ['mintToken'],
                    [defaultAbiCoder.encode(['string', 'address', 'uint256'], [symbol, address, amount])],
                ],
            ),
        );

    beforeEach(async () => {
        const deployGateway = async () => {
            const params = arrayify(
                defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [adminWallets.map(get('address')), threshold, '0x']),
            );
            const auth = await deployContract(ownerWallet, Auth, [getWeightedAuthDeployParam([[operatorWallet.address]], [[1]], [1])]);
            const tokenDeployer = await deployContract(ownerWallet, TokenDeployer);
            const gateway = await deployContract(ownerWallet, AxelarGateway, [auth.address, tokenDeployer.address]);
            const proxy = await deployContract(ownerWallet, AxelarGatewayProxy, [gateway.address, params]);
            await auth.transferOwnership(proxy.address);
            return new Contract(proxy.address, AxelarGateway.abi, ownerWallet);
        };

        const getTokenDeployData = (withAddress) =>
            arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        CHAIN_ID,
                        [getRandomID(), getRandomID()],
                        ['deployToken', 'deployToken'],
                        [
                            defaultAbiCoder.encode(
                                ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
                                [nameA, symbolA, decimals, capacity, withAddress ? tokenA.address : ADDRESS_ZERO, 0],
                            ),
                            defaultAbiCoder.encode(
                                ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
                                [nameB, symbolB, decimals, capacity, withAddress ? tokenB.address : ADDRESS_ZERO, 0],
                            ),
                        ],
                    ],
                ),
            );

        sourceChainGateway = await deployGateway();
        destinationChainGateway = await deployGateway();
        const constAddressDeployer = await deployContract(ownerWallet, ConstAddressDeployer);

        gasService = await deployUpgradable(constAddressDeployer.address, ownerWallet, GasService, GasServiceProxy, [ownerWallet.address]);

        const gmpExpressServiceAddress = await predictContractConstant(
            constAddressDeployer.address,
            ownerWallet,
            GMPExpressServiceProxy,
            'gmpExpressService',
            [],
        );

        gmpExpressService = await deployUpgradable(
            constAddressDeployer.address,
            ownerWallet,
            GMPExpressService,
            GMPExpressServiceProxy,
            [destinationChainGateway.address, gasService.address, ownerWallet.address, gmpExpressServiceAddress, 'Ethereum'],
            [],
            '0x',
            'gmpExpressService',
        );

        tokenA = await deployContract(ownerWallet, MintableCappedERC20, [nameA, symbolA, decimals, capacity]);

        tokenB = await deployContract(ownerWallet, MintableCappedERC20, [nameB, symbolB, decimals, capacity]);

        await sourceChainGateway.execute(
            await getSignedWeightedExecuteInput(getTokenDeployData(false), [operatorWallet], [1], 1, [operatorWallet]),
        );
        await destinationChainGateway.execute(
            await getSignedWeightedExecuteInput(getTokenDeployData(true), [operatorWallet], [1], 1, [operatorWallet]),
        );

        destinationChainTokenSwapper = await deployContract(ownerWallet, DestinationChainTokenSwapper, [tokenA.address, tokenB.address]);

        destinationChainSwapExecutable = await deployContract(ownerWallet, DestinationChainSwapExecutable, [
            destinationChainGateway.address,
            destinationChainTokenSwapper.address,
        ]);

        const expressFactory = new ContractFactory(DestinationChainSwapExpress.abi, DestinationChainSwapExpress.bytecode);
        const expressBytecode = expressFactory.getDeployTransaction(
            destinationChainGateway.address,
            destinationChainTokenSwapper.address,
        ).data;
        const expressSalt = getRandomID();
        await gmpExpressService.deployExpressExecutable(expressSalt, expressBytecode, ownerWallet.address, '0x');
        const expressAddress = await gmpExpressService.deployedProxyAddress(expressSalt, ownerWallet.address);

        destinationChainSwapExpress = new Contract(expressAddress, DestinationChainSwapExpress.abi, ownerWallet);
        const destinationChainSwapExpressProxy = new Contract(expressAddress, ExpressExecutableProxy.abi, ownerWallet);
        destinationChainExpressRegistry = new Contract(await destinationChainSwapExpressProxy.registry(), ExpressRegistry.abi, ownerWallet);

        sourceChainSwapCaller = await deployContract(ownerWallet, SourceChainSwapCaller, [
            sourceChainGateway.address,
            gasService.address,
            destinationChain,
            destinationChainSwapExecutable.address.toString(),
        ]);

        await tokenA.mint(destinationChainGateway.address, 1e9);
        await tokenB.mint(destinationChainTokenSwapper.address, 1e9);

        await sourceChainGateway.execute(
            await getSignedWeightedExecuteInput(getMintData(symbolA, userWallet.address, 1e9), [operatorWallet], [1], 1, [operatorWallet]),
        );
        await tokenA.connect(ownerWallet).mint(userWallet.address, 1e9);
    });

    describe('Executable', () => {
        it('should swap tokens on remote chain', async () => {
            const swapAmount = 1e6;
            const gasFeeAmount = 1e6;
            const convertedAmount = 2 * swapAmount;
            const payload = defaultAbiCoder.encode(['string', 'string'], [symbolB, userWallet.address.toString()]);
            const payloadHash = keccak256(payload);

            const sourceChainTokenA = new Contract(await sourceChainGateway.tokenAddresses(symbolA), MintableCappedERC20.abi, userWallet);
            await sourceChainTokenA.approve(sourceChainSwapCaller.address, swapAmount);

            await expect(
                sourceChainSwapCaller
                    .connect(userWallet)
                    .swapToken(symbolA, symbolB, swapAmount, userWallet.address.toString(), { value: gasFeeAmount }),
            )
                .to.emit(gasService, 'NativeGasPaidForContractCallWithToken')
                .withArgs(
                    sourceChainSwapCaller.address,
                    destinationChain,
                    destinationChainSwapExecutable.address.toString(),
                    payloadHash,
                    symbolA,
                    swapAmount,
                    gasFeeAmount,
                    userWallet.address,
                )
                .and.to.emit(sourceChainGateway, 'ContractCallWithToken')
                .withArgs(
                    sourceChainSwapCaller.address.toString(),
                    destinationChain,
                    destinationChainSwapExecutable.address.toString(),
                    payloadHash,
                    payload,
                    symbolA,
                    swapAmount,
                );

            const approveCommandId = getRandomID();
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

            const approveWithMintData = arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        CHAIN_ID,
                        [approveCommandId],
                        ['approveContractCallWithMint'],
                        [
                            defaultAbiCoder.encode(
                                ['string', 'string', 'address', 'bytes32', 'string', 'uint256', 'bytes32', 'uint256'],
                                [
                                    sourceChain,
                                    sourceChainSwapCaller.address.toString(),
                                    destinationChainSwapExecutable.address,
                                    payloadHash,
                                    symbolA,
                                    swapAmount,
                                    sourceTxHash,
                                    sourceEventIndex,
                                ],
                            ),
                        ],
                    ],
                ),
            );

            const approveExecute = await destinationChainGateway.execute(
                await getSignedWeightedExecuteInput(approveWithMintData, [operatorWallet], [1], 1, [operatorWallet]),
            );

            await expect(approveExecute)
                .to.emit(destinationChainGateway, 'ContractCallApprovedWithMint')
                .withArgs(
                    approveCommandId,
                    sourceChain,
                    sourceChainSwapCaller.address.toString(),
                    destinationChainSwapExecutable.address,
                    payloadHash,
                    symbolA,
                    swapAmount,
                    sourceTxHash,
                    sourceEventIndex,
                );

            const swap = await destinationChainSwapExecutable.executeWithToken(
                approveCommandId,
                sourceChain,
                sourceChainSwapCaller.address.toString(),
                payload,
                symbolA,
                swapAmount,
            );

            await expect(swap)
                .to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainGateway.address, destinationChainSwapExecutable.address, swapAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainTokenSwapper.address, destinationChainSwapExecutable.address, convertedAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainSwapExecutable.address, destinationChainGateway.address, convertedAmount)
                .and.to.emit(destinationChainGateway, 'TokenSent')
                .withArgs(destinationChainSwapExecutable.address, sourceChain, userWallet.address.toString(), symbolB, convertedAmount);
        });
    });

    describe('ExpressExecutable', () => {
        it('should expressExecuteWithToken to swap on remote chain', async () => {
            const swapAmount = 1e6;
            const gasFeeAmount = 1e6;
            const convertedAmount = 2 * swapAmount;
            const payload = defaultAbiCoder.encode(['string', 'string'], [symbolB, userWallet.address.toString()]);
            const payloadHash = keccak256(payload);

            const sourceChainTokenA = new Contract(await sourceChainGateway.tokenAddresses(symbolA), MintableCappedERC20.abi, userWallet);
            await sourceChainTokenA.approve(sourceChainSwapCaller.address, swapAmount);

            await expect(
                sourceChainSwapCaller
                    .connect(userWallet)
                    .swapToken(symbolA, symbolB, swapAmount, userWallet.address.toString(), { value: gasFeeAmount }),
            )
                .to.emit(gasService, 'NativeGasPaidForContractCallWithToken')
                .withArgs(
                    sourceChainSwapCaller.address,
                    destinationChain,
                    destinationChainSwapExecutable.address.toString(),
                    payloadHash,
                    symbolA,
                    swapAmount,
                    gasFeeAmount,
                    userWallet.address,
                )
                .and.to.emit(sourceChainGateway, 'ContractCallWithToken')
                .withArgs(
                    sourceChainSwapCaller.address.toString(),
                    destinationChain,
                    destinationChainSwapExecutable.address.toString(),
                    payloadHash,
                    payload,
                    symbolA,
                    swapAmount,
                );

            await tokenA.connect(userWallet).transfer(gmpExpressService.address, swapAmount);

            await expect(
                gmpExpressService
                    .connect(ownerWallet)
                    .callWithToken(
                        getRandomID(),
                        sourceChain,
                        sourceChainSwapCaller.address,
                        destinationChainSwapExpress.address,
                        payload,
                        symbolA,
                        swapAmount,
                    ),
            )
                .to.emit(destinationChainExpressRegistry, 'ExpressCallWithToken')
                .withArgs(
                    gmpExpressService.address,
                    sourceChain,
                    sourceChainSwapCaller.address.toString(),
                    payloadHash,
                    symbolA,
                    swapAmount,
                )
                .and.to.emit(tokenA, 'Transfer')
                .withArgs(gmpExpressService.address, destinationChainSwapExpress.address, swapAmount)
                .and.to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainSwapExpress.address, destinationChainTokenSwapper.address, swapAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainTokenSwapper.address, destinationChainSwapExpress.address, convertedAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainSwapExpress.address, destinationChainGateway.address, convertedAmount)
                .and.to.emit(destinationChainGateway, 'TokenSent')
                .withArgs(destinationChainSwapExpress.address, sourceChain, userWallet.address.toString(), symbolB, convertedAmount);

            const approveCommandId = getRandomID();
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

            const approveWithMintData = arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        CHAIN_ID,
                        [approveCommandId],
                        ['approveContractCallWithMint'],
                        [
                            defaultAbiCoder.encode(
                                ['string', 'string', 'address', 'bytes32', 'string', 'uint256', 'bytes32', 'uint256'],
                                [
                                    sourceChain,
                                    sourceChainSwapCaller.address.toString(),
                                    destinationChainSwapExpress.address,
                                    payloadHash,
                                    symbolA,
                                    swapAmount,
                                    sourceTxHash,
                                    sourceEventIndex,
                                ],
                            ),
                        ],
                    ],
                ),
            );

            const approveExecute = await destinationChainGateway.execute(
                await getSignedWeightedExecuteInput(approveWithMintData, [operatorWallet], [1], 1, [operatorWallet]),
            );

            await expect(approveExecute)
                .to.emit(destinationChainGateway, 'ContractCallApprovedWithMint')
                .withArgs(
                    approveCommandId,
                    sourceChain,
                    sourceChainSwapCaller.address.toString(),
                    destinationChainSwapExpress.address,
                    payloadHash,
                    symbolA,
                    swapAmount,
                    sourceTxHash,
                    sourceEventIndex,
                );

            const execute = await destinationChainSwapExpress.executeWithToken(
                approveCommandId,
                sourceChain,
                sourceChainSwapCaller.address.toString(),
                payload,
                symbolA,
                swapAmount,
            );

            await expect(execute)
                .to.emit(destinationChainExpressRegistry, 'ExpressCallWithTokenCompleted')
                .withArgs(
                    gmpExpressService.address,
                    approveCommandId,
                    sourceChain,
                    sourceChainSwapCaller.address.toString(),
                    payloadHash,
                    symbolA,
                    swapAmount,
                )
                .and.to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainGateway.address, destinationChainSwapExpress.address, swapAmount)
                .and.to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainSwapExpress.address, gmpExpressService.address, swapAmount);
        });
    });
});
