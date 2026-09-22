"""Minimal broker interface: exactly the calls the live runner needs."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class Account:
    equity: float
    cash: float
    buying_power: float


@dataclass
class BrokerPosition:
    symbol: str
    qty: int
    avg_entry: float
    market_value: float
    unrealized_pnl: float


class Broker(ABC):
    @abstractmethod
    def account(self) -> Account: ...

    @abstractmethod
    def positions(self) -> list[BrokerPosition]: ...

    @abstractmethod
    def submit_bracket(self, symbol: str, qty: int, take_profit: float, stop_loss: float) -> str:
        """Market buy with attached take-profit limit and stop-loss. Returns order id."""

    @abstractmethod
    def close_all(self) -> None:
        """Cancel every open order and flatten every position."""

    @abstractmethod
    def market_open(self) -> bool: ...

    @abstractmethod
    def minutes_to_close(self) -> float | None:
        """Minutes until today's close, or None when the market is closed."""
