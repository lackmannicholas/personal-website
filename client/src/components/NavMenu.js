import React, { Component } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { Nav, Navbar, NavDropdown, NavItem, Accordion } from 'react-bootstrap';
import Card from 'react-bootstrap/Card';
import { LinkContainer } from 'react-router-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import './NavMenu.css';

export class NavMenu extends Component {
  displayName = NavMenu.name

  render() {
    return (
      <Navbar collapseOnSelect expand="md" bg="dark" variant="dark" fixed='top'>
        <Navbar.Brand as={Nav.Link}>Nick Lackman</Navbar.Brand>
        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse id="responsive-navbar-nav">>
          <Nav className="flex-column">
            <LinkContainer to="/">
              <Nav.Link>
                <h4>Home</h4>
              </Nav.Link>
            </LinkContainer>
            <LinkContainer to="/education">
              <Nav.Link>
                <h4>Education</h4>
              </Nav.Link>
            </LinkContainer>
            <LinkContainer to='/experience'>
              <Nav.Link>
                <h4>Experience</h4>
              </Nav.Link>
            </LinkContainer>
            <LinkContainer to='/algorithms'>
              <Nav.Link>
                <h4>Algorithms</h4>
              </Nav.Link>
            </LinkContainer>
            <LinkContainer to="/data-structures">
              <Nav.Link>
                <h4>Data Structures</h4>
              </Nav.Link>
            </LinkContainer>
            <LinkContainer to="/data-structures/arrays">
              <Nav.Link>
                Arrays
              </Nav.Link>
            </LinkContainer>
          </Nav>
        </Navbar.Collapse>
      </Navbar>
    );
  }
}