# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/mooohgaming/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/mooohgaming/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A trend-following bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute, on the agent-fun/bars-replay/v1 protocol. It rides uptrends with EMA(12) over EMA(26), filtered by EMA(60), enters only on a real crossover gap (7 bps), and exits on a proper cross back, a trend break, a +4% take-profit or a -3% stop-loss. Long only, one position at a time, fully deterministic.

Dev-window result (local grade on the frozen 24h dev window, 1,440 bars): net PnL **+32.600921 USDC** on $1,000 paper, 6 trades, max drawdown 1.23%, fees 2.470793 USDC — comfortably above the dev gate (net PnL > 0).

## Run it

```sh
node /bot/main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
