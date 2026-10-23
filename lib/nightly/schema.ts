// zod schema of a case file (final-test/case_public.json): CaseInput.
// JSON numbers become bigint through fromSafeInteger, dates go through parseDate, updated_at stays an ISO string.
// Unknown fields are not an error. Phase 1.
export {};
