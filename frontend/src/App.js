import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "./lib/auth";
import { EditProvider } from "./components/EditKit";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import JoinCommunity from "./pages/JoinCommunity";
import CommunityLanding from "./pages/CommunityLanding";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import MemberProfile from "./pages/MemberProfile";
import Events from "./pages/Events";
import Resources from "./pages/Resources";
import Requests from "./pages/Requests";
import Support from "./pages/Support";
import Matches from "./pages/Matches";
import EventDetail from "./pages/EventDetail";
import Updates from "./pages/Updates";
import SettingsPage from "./pages/Settings";
import Discover from "./pages/Discover";
import Organizations from "./pages/Organizations";
import OrganizationDetail from "./pages/OrganizationDetail";
import Applications from "./pages/Applications";
import Inbox from "./pages/Inbox";
import Notifications from "./pages/Notifications";
import ProfileEdit from "./pages/ProfileEdit";
import Saved from "./pages/Saved";
import Copilot from "./pages/Copilot";
import Admin from "./pages/Admin";
import SetupWizard from "./pages/SetupWizard";
import Hub from "./pages/Hub";
import Legal from "./pages/Legal";

function Protected({ children, admin }) {
  const { user, account, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!user) return <Navigate to="/hub" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

const P = ({ children, admin }) => <Protected admin={admin}><Layout>{children}</Layout></Protected>;

export default function App() {
  const { config } = useAuth();
  return (
    <>
      <Toaster position="top-right" theme={config?.brand?.mode || "dark"} />
      <EditProvider><Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/terms" element={<Legal doc="terms" />} />
        <Route path="/privacy" element={<Legal doc="privacy" />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/hub" element={<Hub />} />
        <Route path="/join/:code" element={<JoinCommunity />} />
        <Route path="/c/:slug" element={<CommunityLanding />} />
        <Route path="/setup" element={<Protected admin><SetupWizard /></Protected>} />
        <Route path="/" element={<P><Dashboard /></P>} />
        <Route path="/members" element={<P><Members /></P>} />
        <Route path="/members/:id" element={<P><MemberProfile /></P>} />
        <Route path="/events" element={<P><Events /></P>} />
        <Route path="/events/:id" element={<P><EventDetail /></P>} />
        <Route path="/matches" element={<P><Matches /></P>} />
        <Route path="/updates" element={<P><Updates /></P>} />
        <Route path="/support" element={<P><Support /></P>} />
        <Route path="/settings" element={<P><SettingsPage /></P>} />
        <Route path="/ask" element={<P><Copilot /></P>} />
        <Route path="/resources" element={<P><Resources /></P>} />
        <Route path="/requests" element={<P><Requests /></P>} />
        <Route path="/discover" element={<P><Discover /></P>} />
        <Route path="/organizations" element={<P><Organizations /></P>} />
        <Route path="/organizations/:slug" element={<P><OrganizationDetail /></P>} />
        <Route path="/applications" element={<P><Applications /></P>} />
        {/* The admin blast composer moved into the Inbox page as a second tab (Blasts) -- this
            route just keeps any bookmarked/old link to it working. */}
        <Route path="/messages" element={<Navigate to="/inbox" replace />} />
        <Route path="/inbox" element={<P><Inbox /></P>} />
        <Route path="/inbox/:threadId" element={<P><Inbox /></P>} />
        <Route path="/notifications" element={<P><Notifications /></P>} />
        <Route path="/profile" element={<P><ProfileEdit /></P>} />
        <Route path="/saved" element={<P><Saved /></P>} />
        {/* Orphaned alias -- every in-app entry point links to /ask now; kept as a redirect (same
            pattern as /messages -> /inbox above) in case anyone has the old path bookmarked. */}
        <Route path="/copilot" element={<Navigate to="/ask" replace />} />
        <Route path="/admin" element={<P admin><Admin /></P>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></EditProvider>
    </>
  );
}
