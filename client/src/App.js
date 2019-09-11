import React, { Component } from 'react';
import { Route } from 'react-router';
import { Layout } from './components/Layout';
import { Home } from './components/Home';
import { Education } from './components/Education';
import { Experience } from './components/Experience';
import { Algorithms } from './components/Algorithms';
import { DataStructures } from './components/DataStructures';

export default class App extends Component {
  displayName = App.name

  render() {
    return (
      <Layout>
            <Route exact path='/' component={Home} />
            <Route path='/education' component={Education} />
            <Route path='/experience' component={Experience} />
            <Route path='/algorithms' component={Algorithms} />
            <Route path='/data-structures' component={DataStructures} />
      </Layout>
    );
  }
}
