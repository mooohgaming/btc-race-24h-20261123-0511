// CBBTC trend bot for make.fun btc-race-24h-20261123-0511.
//
// Strategy (long only, one asset, one position at a time):
//   - Three EMAs over the 1-minute closes: fast 12, slow 26, trend 60.
//     Each starts as the mean of its first `span` closes, then moves
//     2 / (span + 1) of the way to each new close (float64, deterministic).
//   - Enter (whole cash) when the fast EMA crosses above the slow EMA by
//     more than ENTRY_GAP_BPS of the close, and the close is above the
//     trend EMA — i.e. only buy an uptrend, never a flat chop.
//   - Exit (whole position) when the fast EMA crosses back below the slow
//     EMA, or the close drops below the trend EMA, or the position is up
//     TAKE_PROFIT (+2.5% over cost) or down STOP_LOSS (-1.2% under cost).
//   - A rejected exit (fill past the slippage cap, no bar) is retried on
//     the next bar while its reason still holds; an entry waits for the
//     next fresh cross.
//   - Orders fill at the next bar's open, so every decision is made on a
//     closed bar and priced at the following open. max_slippage_bps 100
//     (1%) bounds the move from the close it was decided on.
//   - No clock, no environment, no randomness: the same bars always give
//     the same orders, run after run.

import { BPS, runBars, type BarsState, type Bar, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const FAST_SPAN = 12;
const SLOW_SPAN = 26;
const TREND_SPAN = 60;
/** A cross only counts when fast sits this far above slow, in bps of the close. */
const ENTRY_GAP_BPS = 7;
/** A cross down only counts when fast sits this far below slow, in bps of the close. */
const EXIT_GAP_BPS = 15;
/** A trend break only counts when the close sits this far below the trend EMA, in bps. */
const TREND_BREAK_BPS = 25;
/** Take profit: position worth 26/25 of its cost (+4%). */
const TAKE_PROFIT_NUM = 26n;
const TAKE_PROFIT_DEN = 25n;
/** Stop loss: position worth 97/100 of its cost (-3%). */
const STOP_LOSS_NUM = 97n;
const STOP_LOSS_DEN = 100n;
/** Bars to sit out after any exit before a new entry. */
const COOLDOWN_BARS = 60;
/** Max move from the deciding close an order tolerates, in bps. */
const MAX_SLIPPAGE_BPS = 100;

interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

function newEma(span: number): Ema {
  return { span, warm: [], value: null };
}

function emaStep(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) {
    let sum = 0;
    for (const x of e.warm) sum += x;
    e.value = sum / e.span;
    e.warm = [];
  }
}

const fast = newEma(FAST_SPAN);
const slow = newEma(SLOW_SPAN);
const trend = newEma(TREND_SPAN);
/** fast - slow after the previous bar, once both EMAs are set. */
let prevGap: number | null = null;
/** Set on a cross of fast below slow; held while fast stays below slow. */
let downSignal = false;
/**
 * Entry arming: true at the start and whenever fast falls properly below
 * slow (a real down-cross, not chop noise). An entry needs a fresh
 * arming — the first computed gap can already be positive on a rising
 * window, so an edge-only cross would miss the whole opening trend.
 */
let armed = true;
/** Bars (by batch seq) to sit out after an exit before a new entry. */
let cooldownUntil = -1;

function onBar(bar: Bar): { close: number; gapBps: number | null } {
  const close = Number(bar.c);
  emaStep(fast, close);
  emaStep(slow, close);
  emaStep(trend, close);
  const gap = fast.value !== null && slow.value !== null ? fast.value - slow.value : null;
  const gapBps = gap !== null ? (gap / close) * 10000 : null;
  if (gapBps !== null) {
    if (gapBps < -EXIT_GAP_BPS) downSignal = true;
    if (gapBps >= 0) downSignal = false;
    if (gapBps < -EXIT_GAP_BPS) armed = true;
    prevGap = gap;
  }
  return { close, gapBps };
}

function shouldExit(state: BarsState, held: { qty: bigint; cost: bigint }): boolean {
  if (downSignal) return true;
  const close = state.close(SYMBOL);
  if (close === null) return false;
  const closeNum = Number(close);
  if (trend.value !== null && ((trend.value - closeNum) / closeNum) * 10000 > TREND_BREAK_BPS) return true;
  const value = state.value(SYMBOL, held.qty);
  if (value * TAKE_PROFIT_DEN >= held.cost * TAKE_PROFIT_NUM) return true;
  if (value * STOP_LOSS_DEN <= held.cost * STOP_LOSS_NUM) return true;
  return false;
}

await runBars({
  onBatch(state, batch) {
    let fresh = false;
    let close = 0;
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      fresh = true;
      if (bar.v === '0') continue;
      close = onBar(bar).close;
    }
    if (state.warmingUp || !fresh) return [];

    const { caps, fees } = state.hello;
    const orders: (SellInput | BuyInput)[] = [];
    const held = state.positions.get(SYMBOL);

    if (held !== undefined && shouldExit(state, held)) {
      orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cooldownUntil = state.seq + COOLDOWN_BARS;
      return orders;
    }

    if (held === undefined && armed && state.seq >= cooldownUntil) {
      const gap = fast.value !== null && slow.value !== null ? fast.value - slow.value : null;
      const gapBps = gap !== null ? (gap / close) * 10000 : 0;
      const aboveTrend = trend.value !== null && close > trend.value;
      if (gap !== null && gapBps > ENTRY_GAP_BPS && aboveTrend) {
        let slice = state.cash;
        const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
        if (slice > byWeight) slice = byWeight;
        if (slice >= BigInt(fees.min_notional_quote_units)) {
          orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
          armed = false;
        }
      }
    }
    return orders;
  },
});
