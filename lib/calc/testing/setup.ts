import fc from "fast-check";

// 500 runs per property; fast-check prints the seed and the shrunk counterexample on failure.
fc.configureGlobal({ numRuns: 500 });
