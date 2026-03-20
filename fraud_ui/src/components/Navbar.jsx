import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="flex justify-between items-center px-10 py-5 bg-white shadow-sm">
      <h1 className="text-2xl font-bold text-blue-800">
        AML Secure
      </h1>

      <div className="space-x-8 hidden md:flex">
        <a href="#" className="text-gray-700 hover:text-blue-700">
          Platform
        </a>
        <a href="#" className="text-gray-700 hover:text-blue-700">
          Solutions
        </a>
        <a href="#" className="text-gray-700 hover:text-blue-700">
          AI Engine
        </a>
        <a href="#" className="text-gray-700 hover:text-blue-700">
          Company
        </a>
      </div>

      <div className="space-x-4">
        <Link
          to="/login"
          className="px-5 py-2 border border-blue-700 text-blue-700 rounded-lg"
        >
          Login
        </Link>
        <Link
          to="/signup"
          className="px-5 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
        >
          Request Demo
        </Link>
      </div>
    </nav>
  );
}