// AppRoutes.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import CampaignSummaryPage from "./pages/CampaignSummaryPage.jsx";
import CampaignDetailPage from "./pages/CampaignDetailPage.jsx";

export default function AppRoutes({ campaigns, legs }) {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/campaigns"
          element={<CampaignSummaryPage campaigns={campaigns} />}
        />
        <Route
          path="/campaign/:id"
          element={<CampaignDetailPage campaigns={campaigns} legs={legs} />}
        />
      </Routes>
    </BrowserRouter>
  );
}
