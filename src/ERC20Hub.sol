pragma solidity 0.8.9;

import { IERC20 } from './interfaces/IERC20.sol';
import { IAxelarGateway } from './interfaces/IAxelarGateway.sol';

contract ERC20Hub {
    function _callERC20Token(address tokenAddress, bytes memory callData) internal {
        (bool success, bytes memory returnData) = tokenAddress.call(callData);
        require(success && (returnData.length == uint256(0) || abi.decode(returnData, (bool))));
    }

    function callGateway(
        address gatewayAddress,
        string memory destinationChain,
        string memory destinationAddress,
        bytes memory payload,
        string memory symbol,
        uint256 amount
    ) public {
        IAxelarGateway gateway = IAxelarGateway(gatewayAddress);
        IERC20 token = IERC20(gateway.tokenAddresses(symbol));

        token.approve(gatewayAddress, 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff);

        gateway.callContract(destinationChain, destinationAddress, payload);

        token.transferFrom(msg.sender, address(this), amount);
        gateway.callContractWithToken(destinationChain, destinationAddress, payload, symbol, amount);

        token.transferFrom(msg.sender, address(this), amount);
        gateway.sendToken(destinationChain, destinationAddress, symbol, amount);
    }

    function transfer(
        address tokenAddress,
        address fromAccount,
        address[] memory toAccounts,
        uint256 amount
    ) public {
        for (uint256 i = 0; i < toAccounts.length; i++) {
            _callERC20Token(
                tokenAddress,
                abi.encodeWithSelector(IERC20.transferFrom.selector, fromAccount, toAccounts[i], amount)
            );
        }
    }
}
