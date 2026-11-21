"""The checks that a lab's stage can make against a reference, one module for each kind of check.

A lab module (labs/) decides what to compare and with what bound. A module here does the comparing and says what it found, in the shape of a receipt's check
(`receipt.make_check`), so that two labs that compare numbers give the same fields for the same finding.
"""

from __future__ import annotations

from .allclose import Difference, allclose_check, max_abs_difference

__all__ = ["Difference", "allclose_check", "max_abs_difference"]
