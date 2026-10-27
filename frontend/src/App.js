import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "./lib/auth";
import IntroTour from "./components/IntroTour";
import { EditProvider } from "./components/EditKit";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import DemoLanding from "./pages/DemoLanding";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import JoinCommunity from "./pages/JoinCommunity";
import CommunityLanding from "./pages/CommunityLanding";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import MemberProfile from "./pages/MemberProfile";
import Events from "./pages/Events";
import Classes from "./pages/Classes";
import Learning from "./pages/Learning";
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
import About from "./pages/About";
import Install from "./pages/Install";
import Teams from "./pages/Teams";
import TeamDetail from "./pages/TeamDetail";
import PublicReport from "./pages/PublicReport";
import Navigator from "./pages/Navigator";
import MyProfile from "./pages/MyProfile";

function Protected({ children, admin }) {
  const { user, account, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!user) return <Navigate to="/hub" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

// The Navigator is public: signed-out visitors get it on its own page, members get it inside their community's layout.
function NavigatorRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Layout><Navigator embedded /></Layout> : <Navigator />;
}

// "Your profile" is the account's own profile, so it works with or without a community open: inside the community's layout when
// there is one, on its own page otherwise (same pattern as the Navigator).
function MyProfileRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Layout><MyProfile embedded /></Layout> : <MyProfile />;
}

const P = ({ children, admin }) => <Protected admin={admin}><Layout>{children}</Layout></Protected>;

// Reports now live inside Admin; the old address (and anything bookmarked or shared with it) lands in the right place.
function ReportsRedirect() {
  const { search } = useLocation();
  const q = new URLSearchParams(search); q.set("tab", "reports");
  return <Navigate to={`/admin?${q.toString()}`} replace />;
}

export default function App() {
  const { config } = useAuth();
  return (
    <>
      <Toaster position="top-right" theme={config?.brand?.mode || "dark"} />
      <IntroTour />
      <EditProvider><Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/about" element={<About />} />
        <Route path="/demo/:short" element={<DemoLanding />} />
        <Route path="/navigator" element={<NavigatorRoute />} />
        <Route path="/me" element={<MyProfileRoute />} />
        <Route path="/humber" element={<Navigate to="/demo/humber" replace />} />
        <Route path="/install" element={<Install />} />
        <Route path="/r/:slug/:token" element={<PublicReport />} />
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
        <Route path="/classes" element={<P><Classes /></P>} />
        <Route path="/learning" element={<P><Learning /></P>} />
        <Route path="/teams" element={<P><Teams /></P>} />
        <Route path="/teams/:id" element={<P><TeamDetail /></P>} />
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
        <Route path="/reports" element={<P admin><ReportsRedirect /></P>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></EditProvider>
    </>
  );
}
