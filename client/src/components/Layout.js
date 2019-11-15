import React, { Component } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import {NavMenu} from './NavMenu';

export class Layout extends Component {
  displayName = Layout.name

  render() {
    return (
      <Container fluid>
        <Row>
          <Col md={3}>
            <NavMenu />
          </Col>
          <Col md={9}>
            {this.props.children}
          </Col>
        </Row>
      </Container>
    );
  }
}
