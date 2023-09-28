// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IMapplePoolManager {
    function active() external view returns (bool);
    function openToPublic() external view returns (bool);
    function liquidityCap() external view returns (uint256);

    // poolDelegate functions
    function setOpenToPublic() external; // set openToPublic = true
    function setAllowedLender(address lender, bool isValid) external; // allow lenders
}