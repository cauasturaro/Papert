import type { ShowcaseRoadmap } from '../showcase-roadmaps.js';

export const pythonTestingPytest: ShowcaseRoadmap = {
  id: 'python-testing-pytest',
  definition: {
    title: 'Practical Unit Testing with pytest',
    description:
      'Write readable tests for a parcel pricing function and a shipping boundary. Practice fixtures, parameterized cases, and small test doubles through saved test files.',
    level: 'beginner',
    steps: [
      {
        id: 'specify-price-rule',
        title: 'Turn a rule into a focused example',
        content:
          'A unit test makes a small claim about observable behavior. For a parcel quote, use a rule simple enough to calculate independently: a base price of 500 cents plus 200 cents for each started kilogram. Positive weights are valid; zero and negative weights are errors. Write an example with a fractional weight so rounding behavior is visible rather than accidentally untested. Separate arranging inputs, calling the function, and asserting its result. The reviewer reads these files, so meaningful names and a concrete expected amount are the evidence of understanding rather than a captured test-run result.',
        concepts: ['assertions', 'arrange act assert', 'boundaries'],
        requires: [],
        challenge: {
          instructions:
            'Implement quote_cents in parcel/pricing.py for the stated rule. Write tests/test_pricing.py with a 1.2 kg example expecting 900 cents and a zero-weight example expecting ValueError.',
          criteria: [
            {
              id: 'price-example',
              description:
                'tests/test_pricing.py separates setup, quote_cents invocation, and an explicit assertion that 1.2 kg costs 900 cents.',
            },
            {
              id: 'invalid-weight',
              description:
                'parcel/pricing.py rejects nonpositive weights, and tests/test_pricing.py uses pytest.raises(ValueError) for zero weight.',
            },
          ],
        },
      },
      {
        id: 'share-fixtures',
        title: 'Share setup without sharing mutable state',
        content:
          'A fixture names a prerequisite so several tests can use the same setup idea. It should make the test easier to read rather than hide the value that determines the expected result. For a mutable parcel collection, return a fresh collection for each test using the default function scope. A broad shared fixture can let one test change the starting state of another, producing order-dependent examples. Keep assertions in the tests that explain the behavior, not inside a fixture whose name suggests it only prepares data. Use a small conftest file when the setup belongs to multiple test modules.',
        concepts: ['fixtures', 'fixture scope', 'isolation'],
        requires: ['specify-price-rule'],
        challenge: {
          instructions:
            'Create tests/conftest.py with a function-scoped parcel_weights fixture returning a fresh mutable collection. Add independent tests in tests/test_pricing.py that use and modify their fixture value without module-level shared state.',
          criteria: [
            {
              id: 'fresh-fixture',
              description:
                'tests/conftest.py defines parcel_weights with function scope and constructs its mutable collection inside the fixture.',
            },
            {
              id: 'fixture-consumers',
              description:
                'tests/test_pricing.py has separate fixture-consuming tests, including one that mutates its own value, with assertions outside the fixture.',
            },
          ],
        },
      },
      {
        id: 'parameterize-boundaries',
        title: 'Name the cases around a threshold',
        content:
          'Parameterization presents several examples of one rule without duplicating the whole test body. Choose values around a boundary instead of many arbitrary values that exercise the same path. A started-kilogram charge changes just above an integer weight, so compare an exact kilogram with a slightly heavier parcel. Give cases readable identifiers so their purpose remains clear when someone scans the file. Expected values should be literal amounts calculated from the specification, not a second copy of the production algorithm. Keep invalid-input examples in a separate parameterized test because their expected behavior is an exception rather than a price.',
        concepts: [
          'parametrization',
          'boundary cases',
          'independent expectations',
        ],
        requires: ['share-fixtures'],
        challenge: {
          instructions:
            'Extend tests/test_pricing.py with named parameterized price cases for 0.1, 1.0, and 1.01 kg, plus a separate parameterized rejection test for zero and negative weights.',
          criteria: [
            {
              id: 'price-boundaries',
              description:
                'A pytest.mark.parametrize table names cases and asserts literal expected prices of 700, 700, and 900 cents for 0.1, 1.0, and 1.01 kg.',
            },
            {
              id: 'rejection-table',
              description:
                'A separate parameterized test uses pytest.raises(ValueError) for zero and negative weights without deriving expectations through quote_cents.',
            },
          ],
        },
      },
      {
        id: 'double-carrier',
        title: 'Replace an external collaborator deliberately',
        content:
          'A test double stands in for a dependency whose real behavior is outside the unit being examined. Inject a carrier into label creation so the test can supply a small object that records requests and returns a fixed label. Verify both the returned result and the important arguments crossing that boundary. Add a double that raises an error to describe what happens when the carrier fails. Keep the double smaller than the production collaborator and avoid recreating a network service in the test. These written examples demonstrate the contract without making network requests or requiring credentials.',
        concepts: ['test doubles', 'dependency injection', 'failure behavior'],
        requires: ['parameterize-boundaries'],
        challenge: {
          instructions:
            'Implement create_label in parcel/shipping.py with an injected carrier. Write recording and failing carrier doubles in tests/test_shipping.py; assert the submitted parcel, returned label, and propagation of a carrier failure.',
          criteria: [
            {
              id: 'recording-double',
              description:
                'tests/test_shipping.py supplies a recording carrier and asserts both its received parcel and the fixed label returned by create_label.',
            },
            {
              id: 'failure-double',
              description:
                'tests/test_shipping.py supplies a raising carrier and uses pytest.raises to assert the documented failure propagation without network calls.',
            },
          ],
        },
      },
    ],
    starterFiles: {
      'parcel/pricing.py':
        '# TODO: Define parcel price rules and the quote function.\n',
      'parcel/shipping.py':
        '# TODO: Define label creation with an injected carrier.\n',
      'tests/test_pricing.py':
        '# TODO: Write focused examples of parcel pricing.\n',
      'tests/test_shipping.py':
        '# TODO: Replace the carrier boundary with a test double.\n',
    },
  },
};
