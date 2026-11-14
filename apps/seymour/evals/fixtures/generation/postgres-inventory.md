# Pebble inventory schema handbook

## Naming and identity

The inventory team uses PostgreSQL for a parts catalogue and warehouse stock ledger. Every application table starts with `pbl_`, including join tables. Use plural nouns after this prefix. Keep migrations and query examples in separate files so a reviewer can follow schema evolution without mixing it with application control flow.

A stock movement has an immutable external reference named `movement_receipt_key`. Place a unique constraint on that column. Repeating the same receipt must not create another movement, even when an application retry reaches the database twice. Describe this invariant before introducing insert statements or conflict handling.

## Quantities and history

Stock quantities use integer units. Do not store a mutable total as the only history of a warehouse. The table `pbl_stock_movements` records signed changes, a part reference, and a warehouse reference. Foreign keys must identify existing parts and warehouses, and a check constraint rejects a zero movement.

A query may aggregate these movements to show current stock. Explain grouping and filtering using a small example with more than one warehouse. Keep parameter placeholders in query examples rather than interpolating learner input into SQL strings.

## Review checklist

Reviewers inspect migration definitions, unique constraints, foreign keys, and parameterized query source. Provide test statements covering duplicate receipt keys and unknown warehouse references. The challenge is complete when those protections and expected assertions can be inspected in code; running migrations against a remote database is outside the exercise.
