"""Layer 4: aggregate signals into risk, confidence, severity."""


def aggregate(signals: list[dict]) -> tuple[int, float, str | None]:
    pts = sum(s["points"] for s in signals)
    risk = min(100, pts)
    conf = round(sum(s["points"] * s["confidence"] for s in signals) / pts, 2) if pts else 0.0
    sev = "high" if risk >= 70 else "medium" if risk >= 40 else "low" if risk >= 20 else None
    return risk, conf, sev


def confidence_label(c: float) -> str:
    return "High" if c >= 0.8 else "Medium" if c >= 0.6 else "Low"


from .features import WEIGHTS as _W  # noqa: E402

WEIGHTS: dict[str, int] = {k: w for k, (_, w) in _W.items()}
LABELS: dict[str, str] = {k: label for k, (label, _) in _W.items()}
