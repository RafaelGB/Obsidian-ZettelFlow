import React, { StrictMode } from "react";

export function buildSelectorMenu(){
    return <SelectorMenu />;
}

function SelectorMenu(){
    return(
        <StrictMode>
            <div>
                <h1>Selector Menu</h1>
            </div>
        </StrictMode>
    );
}