import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext.jsx";
import CategoryRouter from "./CategoryRouter.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CategoryRouter />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
