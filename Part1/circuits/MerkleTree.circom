pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template HalveHashes(d) { // helper template for CheckRoot
    signal input inputHashes[2**d];
    signal output outputHashes[2**(d-1)];
    component poseidons[2**(d-1)];
    for (var i = 0; i < 2**(d-1); i++) {
        poseidons[i] = Poseidon(2);
        poseidons[i].inputs[0] <== inputHashes[2*i];
        poseidons[i].inputs[1] <== inputHashes[2*i+1];
        outputHashes[i] <== poseidons[i].out;
    }
}

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels
    signal input leaves[2**n];
    signal output root;
    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves

    // the Merkle tree, being an n-level binary tree, has
    //      2**n + 2**(n-1) + ... + 2 + 1) = 2**(n+1) - 1
    // nodes in total
    signal flattened[2**(n+1)-1];
    //
    component halves[n-1];
    // initialize the hash values at level n
    for (var i = 0; i < 2**n; i++) {
        flattened[i] <== leaves[i];
    }

    // iterate over level (or depth), from the deepest to the root
    var idx = 0; // keeps track of the current index of the array `flattened`
    for (var d = n; d > 0; d--) {
        halves[n-d] = HalveHashes(d);
        // input hashes
        for (var i = 0; i < 2**d; i++) {
            halves[n-d].inputHashes[i] <== flattened[idx+i];
            idx++;
        }
        // output hashes
        for (var i = 0; i < 2**(d-1); i++) {
            flattened[idx+i] <== halves[n-d].outputHashes[i];
            idx++;
        }
    }
    assert(idx == 2**(n+1) - 1);
    root <== flattened[2**(n+1)-2];
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    signal intermediates[n+1];
    component poseidons[n];
    intermediates[0] <== leaf;
    // iterate over levels
    // assumes `path_elements` and `path_index` are lined up from the deep to shallow
    for (var i = 0; i < n; i++) {
        poseidons[i] = Poseidon(2);

        assert(
            (path_index[i] == 0) || (path_index[i] == 1)
        );

        poseidons[i].inputs[1] <== (intermediates[i] - path_elements[i]) * path_index[i] + path_elements[i];
        poseidons[i].inputs[0] <== (path_elements[i] - intermediates[i]) * path_index[i] + intermediates[i];
        // poseidons[i].inputs[0] <== (intermediates[i] - path_elements[i]) * path_index[i] + path_elements[i];
        // poseidons[i].inputs[1] <== (path_elements[i] - intermediates[i]) * path_index[i] + intermediates[i];

        // error:
        //      Non quadratic constraints are not allowed!
        // poseidons[i].inputs[0] <== intermediates[i] * path_index[i] + path_elements[i] * (1 - path_index[i]);
        // poseidons[i].inputs[1] <== path_elements[i] * path_index[i] + intermediates[i] * (1 - path_index[i]);

        // error:
        //      Non-quadratic constraint was detected statically, using unknown index will cause the constraint to be non-quadratic
        // poseidons[i].inputs[path_index[i]] <== path_elements[i];
        // poseidons[i].inputs[!path_index[i]] <== intermediates[i];

        // error:
        //      There are constraints depending on the value of the condition and it can be unknown during the constraint generation phase
        // if (path_index[i] == 0) { // current element is on the left
        //     poseidons[i].inputs[0] <== path_elements[i];
        //     poseidons[i].inputs[1] <== intermediates[i];
        // } else if (path_index[i] == 1) { // current element is on the right
        //     poseidons[i].inputs[0] <== intermediates[i];
        //     poseidons[i].inputs[1] <== path_elements[i];
        // } else { // should not happen
        //     assert(0==1);
        // }

        intermediates[i+1] <== poseidons[i].out;
    }
    root <== intermediates[n];
}
