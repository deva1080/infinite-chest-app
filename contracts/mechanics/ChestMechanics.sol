// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Isolates chest batch result bookkeeping from game orchestration.
/// @dev This module keeps InfiniteChest focused on payments/roll flow and
/// makes it easier to evolve slot-like mechanics later (free opens, bonus phases).
abstract contract ChestMechanics {
    struct RollAccumulator {
        uint256[] rollBuffer;
        uint256 totalRolled;
        uint256[] resultCounts;
    }

    function _initRollAccumulator(
        uint256 maxRolls,
        uint256 outcomes
    ) internal pure returns (RollAccumulator memory accumulator) {
        accumulator.rollBuffer = new uint256[](maxRolls);
        accumulator.resultCounts = new uint256[](outcomes);
    }

    function _recordRoll(RollAccumulator memory accumulator, uint256 rolledIndex) internal pure {
        uint256 cursor = accumulator.totalRolled;
        accumulator.rollBuffer[cursor] = rolledIndex;
        accumulator.totalRolled = cursor + 1;
        accumulator.resultCounts[rolledIndex] += 1;
    }

    function _finalizeRolledIndexes(
        RollAccumulator memory accumulator
    ) internal pure returns (uint256[] memory rolledIndexes) {
        rolledIndexes = new uint256[](accumulator.totalRolled);
        for (uint256 i = 0; i < accumulator.totalRolled; i++) {
            rolledIndexes[i] = accumulator.rollBuffer[i];
        }
    }

    function _buildMintBatch(
        uint256[] storage tokenIds,
        uint256[] memory resultCounts
    ) internal view returns (uint256[] memory mintIds, uint256[] memory mintAmounts) {
        uint256 nonZeroResults;
        for (uint256 i = 0; i < resultCounts.length; i++) {
            if (resultCounts[i] > 0) {
                nonZeroResults++;
            }
        }

        mintIds = new uint256[](nonZeroResults);
        mintAmounts = new uint256[](nonZeroResults);

        uint256 pointer;
        for (uint256 i = 0; i < resultCounts.length; i++) {
            uint256 count = resultCounts[i];
            if (count > 0) {
                mintIds[pointer] = tokenIds[i];
                mintAmounts[pointer] = count;
                pointer++;
            }
        }
    }
}
