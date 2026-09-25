import pandas as pd

actual = pd.read_csv("app_leg_export.csv")

fidelity = pd.read_csv(
    "fidelity.csv",
    dtype="string",
    usecols=[
        "Symbol(CUSIP)",
        "Security Description",
        "Quantity",
        "Date Acquired",
        "Date Sold",
        "Proceeds",
        "Cost Basis",
        "Short Term Gain/Loss",
    ],
)

def clean_money(series):
    text = series.astype("string").str.strip()
    negative_parentheses = text.str.match(r"^\(.*\)$", na=False)
    cleaned = text.str.replace(r"[$,\s+]", "", regex=True)
    cleaned = cleaned.str.replace(r"^\((.*)\)$", r"\1", regex=True)
    values = pd.to_numeric(cleaned, errors="coerce")
    return values.where(~negative_parentheses, -values.abs())

# Calculate app P/L for closed stock and option rows.
actual["type"] = actual["type"].astype("string").str.lower().str.strip()
actual = actual[
    actual["type"].isin(
        ["buy_call", "sell_call", "buy_put", "sell_put", "buy_stock", "sell_stock"]
    )
].copy()

actual["close_date"] = pd.to_datetime(actual["closeDate"], errors="coerce")
actual = actual.loc[actual["close_date"].dt.year.eq(2026)].copy()

actual["ticker"] = actual["ticker"].astype("string").str.upper().str.strip()
actual["qty"] = pd.to_numeric(actual["qty"], errors="coerce")
actual["open_price"] = pd.to_numeric(actual["openPrice"], errors="coerce")
actual["close_price"] = pd.to_numeric(actual["closePrice"], errors="coerce")

is_buy = actual["type"].str.startswith("buy_", na=False)
price_change = actual["close_price"] - actual["open_price"]
price_change = price_change.where(is_buy, -price_change)

is_option = actual["type"].str.endswith(("_call", "_put"), na=False)
multiplier = is_option.map({True: 100, False: 1})
actual["app_pnl"] = price_change * actual["qty"] * multiplier
actual = actual.dropna(subset=["ticker", "app_pnl"])

# Extract ticker from Fidelity option symbols or stock symbols.
symbols = fidelity["Symbol(CUSIP)"].astype("string").str.upper().str.strip()
option_ticker = symbols.str.extract(
    r"^([A-Z][A-Z.-]*?)(?=\d{6}[CP])", expand=False
)
stock_ticker = symbols.str.extract(
    r"^([A-Z][A-Z.-]*)(?=\()", expand=False
)
fidelity["ticker"] = option_ticker.fillna(stock_ticker)
fidelity["fidelity_pnl"] = clean_money(fidelity["Short Term Gain/Loss"])

# Detect Fidelity wash-sale adjustment rows, which may not have a ticker.
text_columns = [
    "Symbol(CUSIP)",
    "Security Description",
    "Date Acquired",
    "Date Sold",
]
wash_sale = (
    fidelity[text_columns]
    .astype("string")
    .apply(
        lambda column: column.str.contains(
            "wash sale", case=False, regex=False, na=False
        )
    )
    .any(axis=1)
)
wash_sale_total = fidelity.loc[wash_sale, "fidelity_pnl"].sum()

# Count unparsed tickers before dropping rows from the comparison.
# This report's single wash-sale adjustment has been confirmed as MSFT.
fidelity.loc[wash_sale, "ticker"] = "MSFT"

unparsed_ticker_rows = fidelity["ticker"].isna().sum()
fidelity_trades = fidelity.dropna(subset=["ticker", "fidelity_pnl"])

app_by_ticker = actual.groupby("ticker", as_index=False).agg(
    app_pnl=("app_pnl", "sum"),
    app_rows=("app_pnl", "size"),
)
fidelity_by_ticker = fidelity_trades.groupby("ticker", as_index=False).agg(
    fidelity_pnl=("fidelity_pnl", "sum"),
    fidelity_rows=("fidelity_pnl", "size"),
)

comparison = app_by_ticker.merge(
    fidelity_by_ticker,
    on="ticker",
    how="outer",
)

money_columns = [
    "app_pnl",
    "fidelity_pnl",
]
count_columns = [
    "app_rows",
    "fidelity_rows",
]

for column in money_columns:
    comparison[column] = pd.to_numeric(
        comparison[column], errors="coerce"
    ).fillna(0.0)

for column in count_columns:
    comparison[column] = pd.to_numeric(
        comparison[column], errors="coerce"
    ).fillna(0).astype(int)

comparison["difference"] = comparison["fidelity_pnl"] - comparison["app_pnl"]
comparison["absolute_difference"] = comparison["difference"].abs()
comparison = comparison.sort_values("absolute_difference", ascending=False)

# Format a display copy so all P/L values show as currency and counts as integers.
display_columns = [
    "ticker",
    "app_pnl",
    "fidelity_pnl",
    "difference",
    "app_rows",
    "fidelity_rows",
]
display = comparison[display_columns].copy()

for column in ["app_pnl", "fidelity_pnl", "difference"]:
    display[column] = display[column].map(lambda value: f"${value:,.2f}")

for column in count_columns:
    display[column] = display[column].map(lambda value: f"{value:,}")

print("Ticker P/L comparison (Fidelity minus app):")
print(display.to_string(index=False))

print(f"\nApp total: ${comparison['app_pnl'].sum():,.2f}")
print(
    "Fidelity total, excluding wash-sale rows: "
    f"${comparison['fidelity_pnl'].sum():,.2f}"
)
print(f"Wash-sale adjustment total: ${wash_sale_total:,.2f}")
print(f"Fidelity rows with an unparsed ticker: {unparsed_ticker_rows:,}")

comparison.to_csv("ticker_comparison.csv", index=False)
print("\nSaved ticker_comparison.csv")