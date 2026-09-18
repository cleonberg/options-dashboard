// src/components/FilterBar.jsx

import React, { useState } from "react";

export default function FilterBar({
    searchTerm = "",
    setSearchTerm,
    startDateFilter = "",
    setStartDateFilter,
    endDateFilter = "",
    setEndDateFilter
}) {
    const [showDateFilters, setShowDateFilters] = useState(false);
    const [activeDatePreset, setActiveDatePreset] = useState(
    startDateFilter || endDateFilter ? "custom" : "all"
    );

    const toISODateStr = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    };

    const handleQuickFilter = (preset) => {
        const now = new Date();

        let start = "";
        let end = toISODateStr(now);

        if (preset === "thisWeek") {
        start = toISODateStr(
            new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - now.getDay()
            )
        );
        } else if (preset === "last30") {
        start = toISODateStr(
            new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - 30
            )
        );
        } else if (preset === "thisMonth") {
        start = toISODateStr(
            new Date(now.getFullYear(), now.getMonth(), 1)
        );
        } else if (preset === "ytd") {
        start = toISODateStr(
            new Date(now.getFullYear(), 0, 1)
        );
        } else if (preset === "all") {
        start = "";
        end = "";
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

    return (
        <div className="filter-bar">

            {/* Search */}
            <div className="filter-search">
                <input
                type="text"
                className="input"
                placeholder="Filter ticker or symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm?.(e.target.value)}
                />
            </div>

            {/* Date Range */}
            <div className="date-filter-dropdown">

                <button
                type="button"
                className="date-filter-toggle"
                onClick={() =>
                    setShowDateFilters((prev) => !prev)
                }
                >
                <span>
                    Date Range

                    {activeDatePreset !== "all" && (
                    <span className="date-filter-current">
                        {" · "}
                        {
                        {
                            thisWeek: "This Week",
                            last30: "Last 30 Days",
                            thisMonth: "This Month",
                            ytd: "YTD",
                            custom: "Custom"
                        }[activeDatePreset]
                        }
                    </span>
                    )}
                </span>

                <span className="date-filter-chevron">
                    {showDateFilters ? "▲" : "▼"}
                </span>
                </button>

                {showDateFilters && (
                <div className="date-filter-content">

                    <div className="filter-section">
                    <div className="filter-section-label">
                        Quick Range
                    </div>

                    <div className="quick-filters">
                        {[
                        ["thisWeek", "This Week"],
                        ["last30", "Last 30 Days"],
                        ["thisMonth", "This Month"],
                        ["ytd", "YTD"],
                        ["all", "All Time"]
                        ].map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            className={`secondary quick-filter ${
                            activeDatePreset === value
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                            handleQuickFilter(value)
                            }
                        >
                            {label}
                        </button>
                        ))}
                    </div>
                    </div>

                    <div className="filter-section">
                    <div className="filter-section-label">
                        Custom Date Range
                    </div>

                    <div className="custom-date-range">

                        <div className="date-field">
                        <label>From</label>

                        <input
                            type="date"
                            className="input"
                            value={startDateFilter}
                            onChange={(e) => {
                            setActiveDatePreset("custom");
                            setStartDateFilter?.(
                                e.target.value
                            );
                            }}
                        />
                        </div>

                        <span className="date-arrow">
                        →
                        </span>

                        <div className="date-field">
                        <label>To</label>

                        <input
                            type="date"
                            className="input"
                            value={endDateFilter}
                            onChange={(e) => {
                            setActiveDatePreset("custom");
                            setEndDateFilter?.(
                                e.target.value
                            );
                            }}
                        />
                        </div>

                    </div>
                    </div>

                </div>
                )}

            </div>

            {/* Clear */}
            {hasActiveFilters && (
                <button
                type="button"
                className="secondary clear-filter"
                onClick={handleClearFilters}
                >
                Clear Filters
                </button>
            )}

        </div>
    );
}