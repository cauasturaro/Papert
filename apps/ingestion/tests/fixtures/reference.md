# Testing strategy

Unit tests cover pure domain rules without a database.

## Integration tests

Integration tests exercise adapters against real infrastructure.

```python
# not a heading inside a fence
assert repository.save(entity)
```
