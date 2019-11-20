import React, { Component } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { Nav, Navbar, NavDropdown, NavItem, Accordion } from 'react-bootstrap';
import Card from 'react-bootstrap/Card';
import { LinkContainer } from 'react-router-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome, faGraduationCap, faBriefcase, faProjectDiagram, faMemory} from '@fortawesome/free-solid-svg-icons';
import './NavMenu.css';

export class NavMenu extends Component {
  displayName = NavMenu.name

  render() {
    return (
      <Navbar collapseOnSelect expand="md" bg="dark" variant="dark" fixed='top'>
        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse id="responsive-navbar-nav">>
          <Nav className="flex-column">
            <Accordion defaultActiveKey="0">
              <Accordion.Toggle as={Card.Header} eventKey="0">
                <LinkContainer to="/">
                  <Nav.Link>
                  <FontAwesomeIcon icon={faHome} />
                  <span> Home</span>
                  </Nav.Link>
                </LinkContainer>
              </Accordion.Toggle> 
              <Accordion.Toggle as={Card.Header} eventKey="1">
                <LinkContainer to="/education">
                  <Nav.Link>
                    <FontAwesomeIcon icon={faGraduationCap} />
                    <span> Education</span>
                  </Nav.Link>
                </LinkContainer>
              </Accordion.Toggle>
              <Accordion.Collapse eventKey="1">
                <Card.Body>
                  <LinkContainer to="/education/wsu">
                    <Nav.Link>
                      Washington State
                    </Nav.Link>
                  </LinkContainer>
                </Card.Body>
              </Accordion.Collapse>
              <Accordion.Toggle as={Card.Header} eventKey="2">
                <LinkContainer to="/experience">
                  <Nav.Link>
                    <FontAwesomeIcon icon={faBriefcase} />
                    <span> Experience</span>
                  </Nav.Link>
                </LinkContainer>
              </Accordion.Toggle>
              <Accordion.Collapse eventKey="2">
                <Card.Body>
                  <LinkContainer to="/experience/airsis">
                    <Nav.Link>
                      AIRSIS
                    </Nav.Link>
                  </LinkContainer>
                </Card.Body>
              </Accordion.Collapse>
              <Accordion.Toggle as={Card.Header} eventKey="3">
                <LinkContainer to="/algorithms">
                  <Nav.Link>
                    <FontAwesomeIcon icon={faProjectDiagram} />
                    <span> Algorithms</span>
                  </Nav.Link>
                </LinkContainer>
              </Accordion.Toggle>
              <Accordion.Collapse eventKey="3">
                <Card.Body>
                  <LinkContainer to="/algorithms/dijkstra">
                    <Nav.Link>
                      Dijkstra's Shortest Path
                    </Nav.Link>
                  </LinkContainer>
                </Card.Body>
              </Accordion.Collapse>
              <Accordion.Toggle as={Card.Header} eventKey="4">
                <LinkContainer to="/data-structures">
                  <Nav.Link>
                    <FontAwesomeIcon icon={faMemory} />
                    <span> Data Structures</span>
                  </Nav.Link>
                </LinkContainer>
              </Accordion.Toggle>
              <Accordion.Collapse eventKey="4">
                <Card.Body>
                  <LinkContainer to="/data-structures/array">
                    <Nav.Link>
                      Arrays
                    </Nav.Link>
                  </LinkContainer>
                </Card.Body>
              </Accordion.Collapse>
            </Accordion>
          </Nav>
        </Navbar.Collapse>
      </Navbar>
    );
  }
}