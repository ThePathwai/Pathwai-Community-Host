import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "./lib/auth";
import { EditProvider } from "./components/EditKit";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import EcosystemHome from "./components/EcosystemHome";
import Planner from "./pages/Planner";
import Ask from "./pages/Ask";
import DemoLanding from "./pages/DemoLanding";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import JoinCommunity from "./pages/JoinCommunity";
import CommunityLanding from "./pages/CommunityLanding";
import HubPeople from "./components/hub/HubPeople";
import MemberProfile from "./pages/MemberProfile";
import HubEvents from "./components/hub/HubEvents";
import HubResources from "./components/hub/HubResources";
import EventDetail from "./pages/EventDetail";
import SettingsPage from "./pages/Settings";
import Legal from "./pages/Legal";
import Site from "./pages/Site";
import SiteAbout from "./pages/SiteAbout";
import SiteContact from "./pages/SiteContact";
import Install from "./pages/Install";
import { HUB } from "./lib/demoHubConfig";
import Navigator from "./pages/Navigator";
import Journey from "./pages/Journey";
import FounderEvents from "./pages/FounderEvents";
import People from "./pages/People";
import PersonProfile from "./pages/PersonProfile";
import MyProfile from "./pages/MyProfile";

function Protected({ children }) {
  const { user, account, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!user) return <Navigate to="/navigator" replace />;
  return children;
}

// The Navigator is public: signed-out visitors get it on its own page, members get it inside their community's layout.
function NavigatorRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Layout><Navigator embedded /></Layout> : <Navigator />; // signed in with no community open: Navigator wraps itself in the account shell
}

// "Your profile" is the account's own profile, so it works with or without a community open: inside the community's layout when
// there is one, on its own page otherwise (same pattern as the Navigator).
function MyProfileRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Layout><MyProfile embedded /></Layout> : <MyProfile />; // no community open: MyProfile wraps itself in the account shell
}

// "Journey" is the account's own startup plan, so like the profile it sits inside a community's layout when one is open and on its own page otherwise.
function JourneyRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Layout><Journey embedded /></Layout> : <Journey />;
}

// Events for founders is the account's own list, so like Journey it sits inside a community's layout when one is open and on its own page otherwise.
function FounderEventsRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Layout><FounderEvents embedded /></Layout> : <FounderEvents />;
}

// People: the account's own directory, so like Talent it sits inside a community's layout when one is open and on its own otherwise.
function PeopleRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Layout><People embedded /></Layout> : <People />;
}
function PersonRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Layout><PersonProfile embedded /></Layout> : <PersonProfile />;
}

// The main address: members get their Home; anyone signed out gets the Pathwai website (sign in is one click away).
function HomeRoute() {
  const { user, account, loading } = useAuth();
  // If the server is slow to say who is signed in, show the website after a moment instead of a spinner that never ends.
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => { if (!loading) return undefined; const t = setTimeout(() => setSlow(true), 1500); return () => clearTimeout(t); }, [loading]);
  if (loading) return slow ? <Site /> : <Spinner />;
  if (!account) return <Site />;
  if (!user) return <Navigate to="/navigator" replace />;
  return <Layout><EcosystemHome /></Layout>;
}

const P = ({ children }) => <Protected><Layout>{children}</Layout></Protected>;

export default function App() {
  const { config } = useAuth();
  return (
    <>
      <Toaster position="top-right" theme={config?.brand?.mode || "dark"} />
      <EditProvider><Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/about" element={<SiteAbout />} />
        <Route path="/contact" element={<SiteContact />} />
        <Route path="/demo/:short" element={<DemoLanding />} />
        <Route path="/navigator" element={<NavigatorRoute />} />
        <Route path="/journey" element={<JourneyRoute />} />
        <Route path="/founder-events" element={<FounderEventsRoute />} />
        <Route path="/people" element={<PeopleRoute />} />
        <Route path="/people/:key" element={<PersonRoute />} />
        <Route path="/me" element={<MyProfileRoute />} />
        <Route path="/demo" element={<Navigate to={`/demo/${HUB.short}`} replace />} />
        <Route path="/install" element={<Install />} />
        <Route path="/terms" element={<Legal doc="terms" />} />
        <Route path="/privacy" element={<Legal doc="privacy" />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/join/:code" element={<JoinCommunity />} />
        <Route path="/c/:slug" element={<CommunityLanding />} />
        <Route path="/" element={<HomeRoute />} />
        <Route path="/assistant" element={<P><Ask /></P>} />
        <Route path="/plan" element={<P><Planner /></P>} />
        <Route path="/members" element={<P><HubPeople /></P>} />
        <Route path="/members/:id" element={<P><MemberProfile /></P>} />
        <Route path="/events" element={<P><HubEvents /></P>} />
        <Route path="/events/:id" element={<P><EventDetail /></P>} />
        <Route path="/resources" element={<P><HubResources /></P>} />
        <Route path="/settings" element={<P><SettingsPage /></P>} />
        {/* Screens that no longer exist send people somewhere that does. */}
        <Route path="/profile" element={<Navigate to="/me" replace />} />
        <Route path="/ask" element={<Navigate to="/assistant" replace />} />
        <Route path="/copilot" element={<Navigate to="/assistant" replace />} />
        <Route path="/hub" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></EditProvider>
    </>
  );
}
