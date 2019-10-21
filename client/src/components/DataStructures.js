import React, { Component } from 'react';

export class DataStructures extends Component {
    displayName = DataStructures.name

    render() {
        return (
            <div>
                <div>
                    <h1>Data Structures</h1>
                    <h2>Coming Soon -> Basic Structures</h2>
                </div>
                <div>
                    <h2>
                        Arrays
                    </h2>
                    <p>
                        Arrays are one of the most basic data structures there is in the programming world. An array is a group
                        of items that are in a single block of memory where the items can be accessed by an index.
                    </p>
                    <code>
                        ["can", "stan", "van", "stan"]
                    </code>
                    <h2>
                        Sets
                    </h2>
                    <p>
                        Sets are a group of items where there cannot be duplicates.
                    </p>
                    <samp>
                        { "can", "stan", "van" }
                    </samp>
                </div>
            </div>
        );
    }
}
