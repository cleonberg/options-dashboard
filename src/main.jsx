import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// import "./index.css";
import { startAuth } from "./auth";

const container = document.getElementById("root");
const root = createRoot(container);

startAuth((user) => {
  if (!user) {
    console.log("Auth ready in main: no user yet");
    root.render(
      <App initialUser={null} />
      // <React.StrictMode>
      //   <App initialUser={null} />
      // </React.StrictMode>
    );
    return;
  }

  console.log("Auth ready in main, uid:", user.uid);
  root.render(
    <App initialUser={user} />
    // <React.StrictMode>
    //   <App initialUser={user} />
    // </React.StrictMode>
  );
});

