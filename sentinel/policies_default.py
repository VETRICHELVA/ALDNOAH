"""Default expense policies (INR). Shared by seed, ingest and detection."""

DEFAULT_POLICIES = [
    # category, max_amount, receipt_required, approval_threshold, approver_role, restricted, weekend_allowed
    ("Meals", 2500, True, 2500, "Manager", False, True),
    ("Travel", 10000, True, 10000, "Manager", False, True),
    ("Accommodation", 8000, True, 8000, "Manager", False, True),
    ("Local Transport", 1500, False, None, None, False, True),
    ("Software Subscription", 50000, True, 25000, "Department Head", False, False),
    ("Office Supplies", 5000, True, 5000, "Manager", False, False),
    ("Client Entertainment", 6000, True, 6000, "Manager", False, False),
    ("Training & Conferences", 40000, True, 15000, "Department Head", False, False),
    ("Telecom & Internet", 3000, True, None, None, False, True),
    ("Gambling", None, True, None, None, True, False),
    ("Personal Expenses", None, True, None, None, True, False),
]

POLICY_FIELDS = ("category", "max_amount", "receipt_required", "approval_threshold",
                 "approver_role", "restricted", "weekend_allowed")


def default_policy_map() -> dict[str, dict]:
    return {p[0]: dict(zip(POLICY_FIELDS, p)) for p in DEFAULT_POLICIES}
