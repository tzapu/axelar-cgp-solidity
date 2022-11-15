// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { AxelarForecallable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executables/AxelarForecallable.sol';
import { IERC20 } from '../../interfaces/IERC20.sol';
import { DestinationChainTokenSwapper } from './DestinationChainTokenSwapper.sol';

contract DestinationChainSwapForecallable is AxelarForecallable {
    DestinationChainTokenSwapper public swapper;

    event Executed(string sourceChain, string sourceAddress, bytes payload);

    constructor(
        address gatewayAddress,
        address forecallService,
        address swapperAddress
    ) AxelarForecallable(gatewayAddress, forecallService) {
        swapper = DestinationChainTokenSwapper(swapperAddress);
    }

    function _execute(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        emit Executed(sourceChain, sourceAddress, payload);
    }

    function _executeWithToken(
        string calldata sourceChain,
        string calldata,
        bytes calldata payload,
        string calldata tokenSymbolA,
        uint256 amount
    ) internal override {
        (string memory tokenSymbolB, string memory recipient) = abi.decode(payload, (string, string));

        address tokenA = gateway.tokenAddresses(tokenSymbolA);
        address tokenB = gateway.tokenAddresses(tokenSymbolB);

        IERC20(tokenA).approve(address(swapper), amount);
        uint256 convertedAmount = swapper.swap(tokenA, tokenB, amount, address(this));

        IERC20(tokenB).approve(address(gateway), convertedAmount);
        gateway.sendToken(sourceChain, recipient, tokenSymbolB, convertedAmount);
    }
}
