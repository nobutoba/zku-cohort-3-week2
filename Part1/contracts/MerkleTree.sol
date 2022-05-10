//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { PoseidonT3 } from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        // the tree has 15 (= 1 + 2 + 4 + 8) nodes in total
        for (uint i = 0; i < 15; i++) {
            // .push() appends a zero-initialized element
            hashes.push();
        }
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
        // there are only 8 leaves
        require(index < 8);
        // update the leaf node (level=3)
        hashes[index] = hashedLeaf;
        // update the node at one level above (level=2) if the index is odd
        if (index % 2 == 1) {
            hashes[7 + index/2] = PoseidonT3.poseidon([hashes[index-1], hashes[index]]);
        }
        // TODO: update nodes at level 1 and level 0 if necessary
        index++;
        // TODO: examine what should be returned (index? or hashedLeaf?)
        return index;
    }

    function verify(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[1] memory input
        ) public view returns (bool) {

        // [assignment] verify an inclusion proof and check that the proof root matches current root
        Proof memory proof;
        proof.A = Pairing.G1Point(a[0], a[1]);
        proof.B = Pairing.G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        proof.C = Pairing.G1Point(c[0], c[1]);
        uint[] memory inputValues = new uint[](input.length);
        for(uint i = 0; i < input.length; i++){
            inputValues[i] = input[i];
        }
        if (verify(inputValues, proof) == 0) {
            return true;
        } else {
            return false;
        }
    }
}
