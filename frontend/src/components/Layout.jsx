import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useLocation } from "react-router";

const Layout = ({ children, showSidebar = false }) => {
  const location = useLocation();
  const isChatPage = location.pathname?.startsWith("/chat");

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {showSidebar && <Sidebar />}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Navbar />

          <main className={`flex-1 ${isChatPage ? "overflow-hidden" : "overflow-y-auto"}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
export default Layout;
