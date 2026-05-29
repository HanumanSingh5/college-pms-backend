import AdminMonitor from './pages/admin/Monitor';
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login';
import Register from './pages/Register';

import AdminDashboard  from './pages/admin/Dashboard';
import AdminFaculties  from './pages/admin/Faculties';
import AdminStudents   from './pages/admin/Students';
import AdminProjects   from './pages/admin/Projects';

import FacultyDashboard from './pages/faculty/Dashboard';
import FacultyTasks     from './pages/faculty/Tasks';

import StudentDashboard from './pages/student/Dashboard';
import StudentTasks     from './pages/student/Tasks';

const role = () => localStorage.getItem('role');

function PrivateRoute({ children, allowedRole }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" />;
  if (allowedRole && role() !== allowedRole) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer position="top-right" autoClose={3000} />
      <Routes>
        <Route path="/admin/monitor" element={<PrivateRoute allowedRole="admin"><AdminMonitor /></PrivateRoute>} />
        <Route path="/login"             element={<Login />} />
        <Route path="/register/:token"   element={<Register />} />

        <Route path="/admin"             element={<PrivateRoute allowedRole="admin"><AdminDashboard /></PrivateRoute>} />
        <Route path="/admin/faculties"   element={<PrivateRoute allowedRole="admin"><AdminFaculties /></PrivateRoute>} />
        <Route path="/admin/students"    element={<PrivateRoute allowedRole="admin"><AdminStudents /></PrivateRoute>} />
        <Route path="/admin/projects"    element={<PrivateRoute allowedRole="admin"><AdminProjects /></PrivateRoute>} />

        <Route path="/faculty"           element={<PrivateRoute allowedRole="faculty"><FacultyDashboard /></PrivateRoute>} />
        <Route path="/faculty/tasks"     element={<PrivateRoute allowedRole="faculty"><FacultyTasks /></PrivateRoute>} />

        <Route path="/student"           element={<PrivateRoute allowedRole="student"><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/tasks"     element={<PrivateRoute allowedRole="student"><StudentTasks /></PrivateRoute>} />

        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}