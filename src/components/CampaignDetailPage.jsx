// src/pages/CampaignDetailPage.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { fmtDaysLeft } from "../logic/logic.js";

export default function CampaignDetailPage({ campaigns, legs }) {
  const { id } = useParams();
  const campaign = campaigns.find(c => c.id === id);

  if (!campaign) {
    return (
      <div className="campaign-detail">
        <p>Campaign not found.</p>
        <Link to="/campaigns">Back to Summary</Link>
      </div>
    );
  }

  const legsForCampaign = legs.filter(l => l.campaignId === id);

  return (
    <div className="campaign-detail">
      <Link to="/campaigns">← Back to Summary</Link>

      <h2>{campaign.ticker} #{campaign.id}</h2>
      <p>Days Left: {fmtDaysLeft(campaign)}</p>

      {/* Plug in your existing components here */}
      {/* <LegsTable legs={legsForCampaign} /> */}
      {/* <Timeline campaign={campaign} legs={legsForCampaign} /> */}
      {/* <PerformanceCharts campaign={campaign} legs={legsForCampaign} /> */}
    </div>
  );
}
