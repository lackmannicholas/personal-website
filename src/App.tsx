import React, { useState } from 'react';
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import Header from './components/Header';
import Pageable from './types/Pageable';
import Footer from './components/Footer';
import ErrorPage from "./routes/ErrorPage";
import DataStructures from './routes/DataStructures';
import Algorithms from './routes/Algorithms';
import SystemsDesign from './routes/SystemsDesign';
import TeamOrganization from './routes/TeamOrganization';
import Agile from './routes/Agile';
import Experience from './routes/Experience';
import Education from './routes/Education';
import Home from './routes/Home';

const defaultTheme = createTheme();

const sections = [
  { title: 'Technology', url: '/' },
  { title: 'Data Structures', url: '/data-structures' },
  { title: 'Algorithms', url: '/algorithms' },
  { title: 'Systems Design', url: '/systems-design' },
  { title: 'Team Organization', url: '/team-org' },
  { title: 'Agile', url: '/agile' },
  { title: 'Experience', url: '/experience' },
  { title: 'Education', url: '/education' },
];

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
    errorElement: <ErrorPage />
  },
  {
    path: "/data-structures",
    element: <DataStructures />,
    errorElement: <ErrorPage />
  },
  {
    path: "/algorithms",
    element: <Algorithms />,
    errorElement: <ErrorPage />
  },
  {
    path: "/systems-design",
    element: <SystemsDesign />,
    errorElement: <ErrorPage />
  },
  {
    path: "/team-org",
    element: <TeamOrganization />,
    errorElement: <ErrorPage />
  },
  {
    path: "/agile",
    element: <Agile />,
    errorElement: <ErrorPage />
  },
  {
    path: "/experience",
    element: <Experience />,
    errorElement: <ErrorPage />
  },
  {
    path: "/education",
    element: <Education />,
    errorElement: <ErrorPage />
  }
]);

export default function App() {
  const [activeSection, setActiveSection] = useState<Pageable>({ title: 'Technology' });

  return (
    <ThemeProvider theme={defaultTheme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Header title={activeSection.title} sections={sections} />
        <main>
        <RouterProvider router={router} />
        </main>
      </Container>
      <Footer
        title="Footer"
        description="Something here to give the footer a purpose!"
      />
    </ThemeProvider>
  );
}
