import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loading } from "./LoadingState";

export default function ProtectedRoute({ children, roles }) {
  const { isAuthed, loading, role } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && role && !roles.includes(role)) {
    return <p className="alert error">You do not have permission to view this page.</p>;
  }
  return children;
}
