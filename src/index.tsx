import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import Header from './Header';
import './index.css';
import reportWebVitals from './reportWebVitals';
import App from './App';
import Footer from './Footer';
import ErrorPage from "./routes/ErrorPage";
import DataStructures from './routes/DataStructures';
import Algorithms from './routes/Algorithms';
import SystemsDesign from './routes/SystemsDesign';
import TeamOrganization from './routes/TeamOrganization';
import Agile from './routes/Agile';
import Experience from './routes/Experience';
import Education from './routes/Education';

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
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
const defaultTheme = createTheme();
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
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

root.render(
  <React.StrictMode>
    <ThemeProvider theme={defaultTheme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Header title="Blog" sections={sections} />
        <RouterProvider router={router} />
      </Container>
      <Footer
        title="Footer"
        description="Something here to give the footer a purpose!"
      />
    </ThemeProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
