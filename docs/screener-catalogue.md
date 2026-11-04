# Screener catalogue: how the 200 screens are grouped

Source: `200-stock-screeners-compared-e1b3ece0.xlsx`, checked by rule text on 2026-11-04. Screens are placed by what their rules test, not by their titles or the workbook's categories. Names below are the source names; they are not Arthscan's final display names and are not claims about returns.

**Status:** Ready = can run on data already stored, once the engine is built. Needs data load = needs a one-off or weekly load first. Intraday store = needs rolling intraday candles. Blocked = needs data we have no source for, so it stays off the site.

## Fundamental (92)

### Investor-style strategies (15)

Named approaches such as Magic Formula, Graham, CANSLIM and Coffee Can.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S004 | Magic Formula | Needs data load | Provider key metrics (cash and net debt for earnings yield and ROIC) |
| S010 | Piotroski Scan | Blocked | Piotroski needs current ratio and gross margin for two years |
| S014 | Benjamin Graham and Warren Buffett | Needs data load | Dhan weekly snapshot (sector or industry P/E) |
| S015 | Coffee Can Portfolio | Ready |  |
| S024 | Peter Lynch stock screener | Ready |  |
| S028 | CANSLIM Ganesh - the original Canslim scan 2010 | Ready |  |
| S033 | SpringPad's Alpha+ Investing Screener | Ready |  |
| S040 | CANSLIM Stocks | Blocked | "Expected quarterly EPS" is a forecast field we don't have |
| S043 | Safal_Niveshak_10Yrs | Blocked | Altman Z needs working capital from current assets and liabilities |
| S047 | SOIC | Blocked | Promoter pledge is not available |
| S048 | CANSLIM for success | Ready |  |
| S050 | GARP Stocks | Blocked | "Expected quarterly net profit" is a forecast field we don't have |
| S056 | Basant Maheshwari screen | Ready |  |
| S069 | Peter Lynch Screener by Shankar Nath | Needs data load | Full price history (5-year P/E) and Dhan industry P/E |
| S088 | zerodha checklist | Ready |  |

### Quarterly results (8)

Latest-quarter growth, margins and turnarounds.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S002 | The Bull Cartel | Ready |  |
| S011 | High Growth High RoE  Low PE | Ready |  |
| S013 | Loss to Profit Companies | Ready |  |
| S021 | Quarterly Growers | Ready |  |
| S025 | Highest YOY Quarterly profit growth | Ready |  |
| S026 | Best of latest quarter | Ready |  |
| S037 | All Latest QTR Results [Date Wise] | Ready |  |
| S080 | YoY & QoQ OPM Margin Expansion Recent Qtr Tracker | Ready |  |

### Long-term growth (8)

Multi-year sales, profit and EPS growth.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S005 | Growth Stocks | Blocked | G Factor is Screener.in's own score |
| S023 | Growth without dilution | Blocked | No reliable 10-year share-count history |
| S036 | best long term stocks | Ready |  |
| S073 | Best CAGR Stocks | Ready |  |
| S075 | Growth stocks for next 5 years | Ready | "Profit after tax > 20%" applies a percent to a rupee field. |
| S096 | Profit jump by 200% | Ready | Rule only passes when both prior years were not profitable, which conflicts with its description. |
| S100 | Sales jump by 200% | Ready |  |
| S102 | Highest Earning per share - EPS Stocks | Needs data load | Full price history (close 5 years ago) |

### Quality and returns (12)

High ROE or ROCE, strong margins, cash generation.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S019 | Bluest of the Blue Chips | Ready |  |
| S020 | Value Stocks | Ready |  |
| S022 | Multibagger Stocks | Blocked | Piotroski needs current ratio and gross margin for two years |
| S029 | High Quality Businesses | Ready |  |
| S031 | MULTI-BAGGER IDEAS | Blocked | Pledge, contingent liabilities and current assets are not available |
| S052 | Time to BUY | Ready |  |
| S060 | Fundamentally strong stocks | Blocked | Promoter pledge is not available |
| S066 | Prakash Behura | Blocked | Piotroski needs current ratio and gross margin for two years |
| S070 | Fundamental Picks | Ready |  |
| S077 | Momentum stocks | Blocked | Piotroski and Altman Z need current assets and two years of ratios; Title says momentum; the rule has no price condition. |
| S079 | Formula 1 | Blocked | One branch needs a Piotroski score; Mixed AND/OR with no brackets; meaning depends on precedence. |
| S105 | Top stocks with the highest EPS - Earning per share | Ready |  |

### Value (14)

Low P/E or P/B, below book or intrinsic value.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S003 | Low on 10 year average earnings | Ready |  |
| S027 | Book value over 5 times price | Ready |  |
| S030 | Undervalued stocks | Needs data load | Provider key metrics (ROIC) |
| S045 | Low PE and High EPS Growth | Ready |  |
| S055 | low price shares | Ready |  |
| S057 | All Positives | Ready |  |
| S062 | Stocks Below Intrinsic Value | Ready |  |
| S063 | search for value stock | Ready |  |
| S067 | Undervalued (Non-Banking) | Needs data load | Full price history, Dhan industry P/B and provider EV figures |
| S082 | HIGH BOOK VALUE STOCKS | Ready |  |
| S085 | Undervalued companies | Needs data load | Full price history (5-year historical P/E) |
| S087 | High Ratio of Market Value of Investments | Blocked | Market value of quoted investments is not available |
| S091 | Cash exceed Marketcap | Needs data load | Provider key metrics (cash per share) |
| S101 | Top stocks with the lowest Price Earning Ratios(PE) | Ready |  |

### Dividends (2)

Dividend payers with history and profit checks.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S006 | Highest Dividend Yield Shares | Ready |  |
| S058 | Good Stocks near 52 week low | Ready |  |

### Debt and balance sheet (5)

Low or falling debt, capacity expansion.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S009 | Capacity expansion | Ready |  |
| S012 | Debt reduction... | Blocked | Gross block is not in the statements (only net fixed assets) |
| S092 | Debt Free with below book value | Ready |  |
| S095 | Debt free companies | Ready |  |
| S098 | Low debt companies | Ready |  |

### Ownership (6)

FII, DII and promoter holdings and changes.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S001 | FII Buying | Ready |  |
| S059 | MUTUAL FUNDS | Ready | Title says mutual funds; the rule tests FII and DII holdings. |
| S078 | FII AND DII Increase STAKE | Ready |  |
| S083 | DII Buying | Ready |  |
| S084 | Promoter Holding More than 75% | Ready |  |
| S093 | Promoter buying shares | Blocked | Promoter pledge is not available |

### Size and price bands (13)

Large, mid and small caps; low-priced shares.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S032 | stocks under 100 | Needs data load | Provider key metrics (ROIC) |
| S038 | Penny stocks less than Rs.1 | Ready |  |
| S042 | Intraday Stock list | Ready | Title says intraday; the rule is a price and market-cap band. |
| S054 | below one rupee stocks | Ready |  |
| S064 | Manas sub 600 crore FF | Ready |  |
| S068 | Penny stocks under 10 | Ready |  |
| S072 | Fundamentally good Penny stock | Blocked | Promoter pledge is not available |
| S089 | Small cap companies | Ready |  |
| S090 | Top 1000 stocks | Ready |  |
| S094 | Penny stock below 2 rs | Ready |  |
| S097 | Large cap stocks | Ready |  |
| S099 | Mid cap stocks | Ready |  |
| S103 | Small cap stocks | Ready |  |

### Fundamentals with price strength (9)

Business filters plus a price or trend condition.

| ID | Source name | Status | Notes |
|---|---|---|---|
| S039 | Swing trading - growth stocks | Ready |  |
| S044 | Tomorrow bullish or bearish best stock | Ready |  |
| S049 | near Breakout stocks in uptrend | Ready |  |
| S051 | STOCKS FOR SHORT TERM BUYING | Ready |  |
| S053 | Intraday stocks | Needs data load | Provider key metrics (current ratio); Title says intraday; the rule is annual and quarterly fundamentals. |
| S071 | Intraday Bullish Stocks for Next Day | Blocked | Piotroski needs current ratio and gross margin for two years |
| S074 | Breakout stocks for Intraday | Ready |  |
| S076 | NEXT MULTIBAGGER STOCK | Blocked | Promoter pledge is not available |
| S086 | 200 EMA Stocks | Blocked | Piotroski and Altman Z need current assets and two years of ratios |

## Technical: daily (70)

### 52-week and all-time levels (6)

Near or at highs and lows.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S007 | Companies creating new high | Bullish | Daily | All | Ready |  |
| S017 | Darvas Scan | Bullish | Daily | All | Ready |  |
| S041 | Low from 52 week high | Neutral | Daily | All | Ready |  |
| S046 | All Time High Stocks | Bullish | Daily | All | Needs data load | Full price history (all-time high) |
| S081 | Stocks nearing 52 week high | Bullish | Daily | All | Ready |  |
| S133 | 52 WEEK LOW | Neutral | Daily, weekly | All | Ready |  |

### Breakouts and volume surges (11)

Price moves with unusual volume, top gainers.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S016 | Price Volume Action | Bullish | Daily | All | Ready |  |
| S035 | Daily Upper Circuit | Bullish | Daily | All | Ready | Title says upper circuit; the rule tests a gain above 3%, not a circuit limit. |
| S065 | Top gainers of the day | Bullish | Daily | All | Ready |  |
| S104 | pious volume generator | Bullish | Daily, weekly | All | Ready |  |
| S108 | Short term breakouts | Bullish | Daily | All | Ready |  |
| S109 | NKS BEST BUY STOCKS FOR INTRADAY | Bullish | Daily, weekly, monthly | F&O | Ready |  |
| S110 | Potential breakouts | Bullish | Daily | All | Ready |  |
| S113 | Strong stocks | Bullish | Daily | All | Ready |  |
| S118 | Bullish - Momentum Stocks | Bullish | Daily | All | Ready |  |
| S137 | 003-NR7-9:30 Buy Scan | Bullish | Daily, weekly, monthly | F&O | Ready | Title says NR7; the rule finds a wider range, not a narrow one. |
| S193 | Chart Link | Bullish | Daily, weekly | All | Ready |  |

### Moving averages and crossovers (10)

SMA and EMA crosses, price near averages.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S008 | Golden Crossover | Bullish | Daily | All | Ready |  |
| S034 | Bearish Crossovers | Bearish | Daily | All | Ready |  |
| S061 | Stocks near 200 DMA | Neutral | Daily | All | Ready |  |
| S106 | Penny Stocks - Multi Bagger | Bullish | Daily | All | Ready |  |
| S135 | Technical Indicators | Bullish | Daily | All | Ready |  |
| S191 | EMA crossover(5,13,26) scan | Bullish | Daily | All | Ready |  |
| S192 | Futures crossover | Bullish | Daily | F&O | Needs data load | Full price history (200-day EMA needs a long warm-up) |
| S194 | 4 moving average crossover-1 | Bullish | Daily | All | Ready |  |
| S198 | Stocks above 200 EMA | Bullish | Daily | All | Needs data load | Full price history (200-day EMA needs a long warm-up) |
| S200 | Mm 200 SMA crossover | Bullish | Daily | All | Ready |  |

### RSI and MACD (9)

Oversold, overbought, momentum crosses.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S018 | RSI - Oversold Stocks | Neutral | Daily | All | Ready |  |
| S107 | position buy seema | Bullish | Daily, weekly | All | Ready |  |
| S115 | Daily RSI Oversold/Overbought scan | Neutral | Daily | All | Ready | Mixed AND/OR with no brackets; meaning depends on precedence. |
| S144 | TSS Momentum Long | Bullish | Daily | F&O | Ready |  |
| S147 | Abhishek Bullish RSI Divergence | Bullish | Daily | All | Ready |  |
| S171 | Shot Down | Bearish | Daily | All | Ready |  |
| S183 | Copy - RSI BREAKOUT | Bullish | Daily | F&O | Ready |  |
| S196 | GOOD WeeKly _MACD AND EMA 12,26 crossover | Bullish | Daily, weekly, monthly | F&O | Needs data load | Full price history (monthly MACD) |
| S197 | Monthly RSI Above 50 | Bullish | Daily, monthly | All | Needs data load | Full price history (monthly RSI) |

### Trend systems (8)

ADX, Supertrend, Ichimoku, multi-indicator.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S112 | FNO stocks Bullish Trend scanner (Moving average + ADX + MACD ) - Prabhu | Bullish | Daily | F&O | Ready |  |
| S119 | pure bullish trend stocks | Bullish | Daily | All | Ready |  |
| S148 | Strong Uptrend F&O Stocks ( price > 180 RS) - Prabhu | Bullish | Daily | F&O | Ready |  |
| S150 | MomentumDailyBearish_AmitB | Bearish | Daily | F&O | Ready |  |
| S155 | Chanakya Bearish Scanner - Working | Bearish | Daily | F&O | Ready |  |
| S160 | Stocks in Downtrend | Bearish | Daily | All | Ready |  |
| S190 | Ichimoku Uptrend Cloud Crossover | Bullish | Daily | All | Ready |  |
| S195 | Stocks closing below the supertrend line | Bullish | Daily | All | Ready | Title says below Supertrend; the rule finds price crossing above. |

### Candlestick patterns (11)

Engulfing, harami, doji, pin bars.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S120 | Doji - daily | Neutral | Daily | Nifty 50 | Needs data load | Nifty 50 member list stored |
| S128 | Hanging man - daily | Bearish | Daily, weekly | Nifty 500 | Needs data load | Nifty 500 member list stored; As written it is effectively unmatchable: the shadow test compares a small range with about 30% of the price. |
| S141 | Bullish Engulfing Pattern | Bullish | Daily | All | Ready |  |
| S142 | Morning Star - Bullish Pattern | Bullish | Daily | All | Ready |  |
| S143 | Bullish Engulf | Bullish | Daily | All | Ready |  |
| S145 | Enhanced BTST bullish engulfing | Bullish | Daily | F&O | Ready |  |
| S146 | BULLISH HARAMI | Bullish | Daily | All | Ready |  |
| S151 | Bullish Pin Bar | Bullish | Daily | All | Ready |  |
| S153 | Bearish Engulifing-see after 3:15 PM for Next day trade | Bearish | Daily | F&O | Ready |  |
| S163 | Bearish Pinbar - EOD | Bearish | Daily | F&O | Ready |  |
| S164 | BEARISH HARAMI | Bearish | Daily | All | Ready |  |

### Narrow range and volatility (5)

NR7, inside bars, Bollinger Bands.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S111 | BOSS SCANNER FOR BTST | Bullish | Daily, weekly, monthly | All | Needs data load | Full price history (monthly RSI, 50-month WMA) |
| S116 | NR7- CURRENT DAY | Neutral | Daily | F&O | Ready |  |
| S131 | Narrow Range 7 - NR7 | Neutral | Daily | F&O | Ready |  |
| S132 | NR7/NR4 with INSIDE | Neutral | Daily | F&O | Ready |  |
| S136 | NR7 IB - NR7 stocks with Inside Bar pattern by www.squareoff.in | Neutral | Daily | F&O | Ready |  |

### Open and gap setups (10)

Open = high, open = low, gaps, day structure.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S114 | PERFECT SELL (SHORT) | Bearish | Daily | F&O | Ready |  |
| S134 | OHOL+PRB | Neutral | Daily | F&O | Ready |  |
| S140 | Open High Low Scanner Intraday | Neutral | Daily | All | Ready |  |
| S152 | PERFECT BEARISH | Bearish | Daily | F&O | Ready |  |
| S158 | Highly Bearish I-day | Bearish | Daily | F&O | Ready |  |
| S165 | SELL OPEN=HIGH | Bearish | Daily | F&O | Ready |  |
| S173 | Secondary Gap Up Opening, Open-High - SHORT Intraday | Bearish | Daily | F&O | Ready |  |
| S177 | BUY open equals to Low | Bullish | Daily | Nifty 50 | Needs data load | Nifty 50 member list stored |
| S178 | Day low = High | Bullish | Daily | F&O | Ready |  |
| S180 | Santu baba trick on open equal low with 1% higher than previous close | Bullish | Daily | All | Ready |  |

## Technical: intraday (38)

### Intraday candlesticks (9)

15-minute patterns.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S121 | Tweezer Bottom 15min-Timeframe Scan | Bullish | 15m | Nifty 500 | Intraday store |  |
| S122 | Bullish marubozu for 15 min | Bullish | 15m | Nifty 500 | Intraday store |  |
| S123 | Tweezer Top 15-Timeframe Scan | Bearish | 15m | Nifty 500 | Intraday store |  |
| S124 | Dark cloud cover 15min timeframe | Bearish | 15m | All | Intraday store | As written it can never match: the formula reduces to close < half the prior open, while also requiring close > prior open. |
| S125 | Dragonfly Doji - 15min | Bullish | 15m | Nifty 500 | Intraday store |  |
| S126 | Bearish harami for 15min-timeframe | Bearish | 15m | All | Intraday store |  |
| S127 | Piercing pattern 15min timeframe | Bullish | 15m | All | Intraday store | As written it can never match: the formula needs close above about 1.5x the prior price, while also below the prior open. |
| S129 | Bullish harami for 15min-timeframe | Bullish | 15m | Nifty 500 | Intraday store |  |
| S130 | Bearish Spinning top for previous 15min timeframe | Bearish | 15m | Nifty 500 | Intraday store |  |

### Intraday breakouts and volume (6)

5 and 15-minute range breaks and spikes.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S117 | Breaking Days High - 5 Mins | Bullish | 5m | All | Intraday store |  |
| S138 | 15 min Candle outside bollinger band | Neutral | 15m | F&O | Intraday store |  |
| S139 | First 15 Min Candle Breakout on both sides | Neutral | 15m | F&O | Intraday store |  |
| S154 | Intraday Sell | Bearish | 5m | F&O | Intraday store |  |
| S159 | Volume Spike in 5 minutes | Neutral | 5m | F&O | Intraday store |  |
| S170 | Stocks near support level - bearish (Parimal Wadiwala) 15 minutes | Bearish | 15m | All | Intraday store |  |

### Intraday trend and momentum (23)

EMA, ADX, Supertrend, MACD on 5-minute to 4-hour candles.

| ID | Source name | Direction | Timeframe | Universe | Status | Notes |
|---|---|---|---|---|---|---|
| S149 | MomentumHourlyBearish_AmitB | Bearish | 1h | All | Intraday store |  |
| S156 | My-intraday-sell-setup-ADX | Bearish | 5m, 10m | F&O | Intraday store |  |
| S157 | Sell 15 Min | Bearish | 5m, 15m | F&O | Intraday store |  |
| S161 | ADX Future 15 Min | Bearish | 15m, 30m | F&O | Intraday store |  |
| S162 | Momentum sell (RDX) | Bearish | 1h | F&O | Intraday store |  |
| S166 | My Intraday sell setup | Bearish | 5m, 10m | F&O | Intraday store |  |
| S167 | FULLY BEARISH WITH SELLING SEEN IN LAST 15MIN | Bearish | 5m, 15m | F&O | Intraday store |  |
| S168 | Intraday Future Sell with SuperTrend -80 % Accuracy | Bearish | 5m, 1h | F&O | Intraday store |  |
| S169 | Mohan'S sure sell candidate -- MACD CROSS | Bearish | 2h, 4h | F&O | Intraday store |  |
| S172 | Ichimoku Cloud Bottom Crossover | Bearish | 15m | Not specified | Intraday store | Source universe is unresolved; shown here as not specified. |
| S174 | Intra Opt pe 5 | Bearish | 5m, 1h | F&O | Intraday store |  |
| S175 | Intraday bearish but longer time frame bullish | Neutral | 15m, weekly, monthly | F&O | Intraday store |  |
| S176 | Intra PE 15 | Bearish | 15m | F&O | Intraday store |  |
| S179 | JAVEED HUSSAIN INTRADAY BUY | Bullish | 5m | F&O | Intraday store |  |
| S181 | my-intraday-buy-setup-pivot | Bullish | 5m, 10m | F&O | Intraday store | Compares 5-minute volume with a price average (sma of close), which looks like a source mistake. |
| S182 | IntraDay Long: | Bullish | 5m, 1h | All | Intraday store |  |
| S184 | My-intraday-buy-setup-ADX | Bullish | 5m | F&O | Intraday store |  |
| S185 | Ichimoku Cloud Top Crossover | Bullish | 15m | Not specified | Intraday store | Source universe is unresolved; shown here as not specified. |
| S186 | Intra Opt15 | Bullish | 15m | F&O | Intraday store |  |
| S187 | Intra CE 5 | Bullish | 5m | F&O | Intraday store |  |
| S188 | BTST OR READY TO BULL RUN | Bullish | 5m | F&O | Intraday store |  |
| S189 | Intraday Jackpot Buy Stock Slection By Rk Meena | Bullish | 15m | F&O | Intraday store |  |
| S199 | Moving Average Crossover (Bullish) | Bullish | 1h | F&O | Intraday store |  |
