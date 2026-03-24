import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import CustomerDashboard from "./pages/CustomerDashboard"
import AnalystDashboard from "./pages/AnalystDashboard";
import ProfileSetup from "./pages/ProfileSetup";

function App() {
  return (
    <Router>
      
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
       
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/CustomerDashboard" element={<CustomerDashboard/>}></Route>
        <Route path="/AnalystDashboard" element={<AnalystDashboard/>}></Route>
        <Route path="/profile-setup" element={<ProfileSetup />} />
      </Routes>
    </Router>
  );
}

export default App;