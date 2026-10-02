import React, { useState } from "react";

const DATE_PRESETS = [
    ["ytd", "YTD"],
    ["365d", "365d"],
    ["90d", "90d"],
    ["30d", "30d"],
    ["7d", "7d"],
];

const PRESET_LABELS = Object.fromEntries(DATE_PRESETS);

export default function FilterBar({
    searchTerm = "",
    setSearchTerm,
    startDateFilter = "",
    setStartDateFilter,
    endDateFilter = "",
    setEndDateFilter
}) {
    const [showDateFilters, setShowDateFilters] = useState(false);
    const [activeDatePreset, setActiveDatePreset] = useState("ytd");
    const toISODateStr = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    };

    const handleQuickFilter = (preset) => {
        const today = new Date();
        let start = "";
        let end = "";

        if (preset === "ytd") {
            start = toISODateStr(new Date(today.getFullYear(), 0, 1));
            end = toISODateStr(today);
        } else {
            const days = Number.parseInt(preset, 10);
            const firstDay = new Date(
                today.getFullYear(),
                today.getMonth(),
                today.getDate()
            );
            firstDay.setDate(firstDay.getDate() - days + 1);

            start = toISODateStr(firstDay);
            end = toISODateStr(today);
        }

        setActiveDatePreset(preset);
        setStartDateFilter?.(start);
        setEndDateFilter?.(end);
    };

    const handleClearFilters = () => {
        setSearchTerm?.("");
        setStartDateFilter?.("");
        setEndDateFilter?.("");
        setActiveDatePreset("all");
    };

    const hasActiveFilters =
        Boolean(searchTerm) ||
        Boolean(startDateFilter) ||
        Boolean(endDateFilter);

    const activeLabel =
        activeDatePreset === "custom"
            ? "Custom"
            : PRESET_LABELS[activeDatePreset];

    return (
        <div className="filter-bar">
            <div className="filter-primary-row">
                <div className="filter-search">
                    <input
                        type="text"
                        className="input"
                        placeholder="Ticker or symbol..."
                        value={searchTerm}
                        onChange={(event) =>
                            setSearchTerm?.(event.target.value)
                        }
                        aria-label="Filter by ticker or symbol"
                    />
                </div>

                {hasActiveFilters && (
                    <button
                        type="button"
                        className="secondary clear-filter"
                        onClick={handleClearFilters}
                        aria-label="Clear all filters"
                        title="Clear all filters"
                    >
                        Clear
                    </button>
                )}
            </div>

            <div className="filter-date-row">
                <div className="quick-filters" aria-label="Date presets">
                    {DATE_PRESETS.map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            className={`secondary quick-filter ${
                                activeDatePreset === value ? "selected" : ""
                            }`}
                            onClick={() => handleQuickFilter(value)}
                            aria-pressed={activeDatePreset === value}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="date-filter-dropdown">
                    <button
                        type="button"
                        className="date-filter-toggle"
                        onClick={() =>
                            setShowDateFilters((visible) => !visible)
                        }
                        aria-expanded={showDateFilters}
                        aria-controls="filter-date-content"
                    >
                        <span className="date-filter-toggle-label">
                            Dates
                            {activeDatePreset !== "all" && (
                                <span className="date-filter-current">
                                    {" · "}
                                    {activeLabel}
                                </span>
                            )}
                        </span>
                        <span
                            className="date-filter-chevron"
                            aria-hidden="true"
                        >
                            {showDateFilters ? "▲" : "▼"}
                        </span>
                    </button>

                    {showDateFilters && (
                        <div
                            className="date-filter-content"
                            id="filter-date-content"
                        >
                            <div className="filter-section-label">
                                Custom Date Range
                            </div>

                            <div className="custom-date-range">
                                <label className="date-field">
                                    <span>From</span>
                                    <input
                                        type="date"
                                        className="input"
                                        value={startDateFilter}
                                        onChange={(event) => {
                                            setActiveDatePreset("custom");
                                            setStartDateFilter?.(
                                                event.target.value
                                            );
                                        }}
                                    />
                                </label>

                                <span
                                    className="date-arrow"
                                    aria-hidden="true"
                                >
                                    →
                                </span>

                                <label className="date-field">
                                    <span>To</span>
                                    <input
                                        type="date"
                                        className="input"
                                        value={endDateFilter}
                                        onChange={(event) => {
                                            setActiveDatePreset("custom");
                                            setEndDateFilter?.(
                                                event.target.value
                                            );
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}