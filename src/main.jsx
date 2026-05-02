import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import CategoryRouter from "./CategoryRouter.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <CategoryRouter />
    </BrowserRouter>
  </React.StrictMode>
);
