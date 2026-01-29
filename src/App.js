import React, { useState, useContext } from "react";
import { BrowserRouter as Router, Route, Routes, useParams } from "react-router-dom";
import Board from "./components/Board";
import Toolbar from "./components/Toolbar";
import Toolbox from "./components/Toolbox";
import Sidebar from "./components/Sidebar";
import BoardProvider from "./store/BoardProvider";
import ToolboxProvider from "./store/ToolboxProvider";
import Login from "./components/Login";
import Register from "./components/Register";
import boardContext from "./store/board-context";

function HomePage() {
  const { id } = useParams(); // Get the dynamic id
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isUserLoggedIn } = useContext(boardContext);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  return (
    <ToolboxProvider>
      <div className="app-container">
        <button
          onClick={toggleSidebar}
          className={`fixed top-5 right-5 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg hover:bg-indigo-600 transition-colors ${isSidebarOpen ? "opacity-40" : "opacity-100"}`}
        >
          <span aria-hidden="true">{isUserLoggedIn ? "✓" : "✕"}</span>
        </button>
        <Toolbar />
        <Board id={id}/>
        <Toolbox />
        <Sidebar isOpen={isSidebarOpen} /> 
      </div>
    </ToolboxProvider>
  );
}

function App() {
  return (
    <BoardProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/:id" element={<HomePage />} /> 
        </Routes>
      </Router>
    </BoardProvider>
  );
}

export default App;
