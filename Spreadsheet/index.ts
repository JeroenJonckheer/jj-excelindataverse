/*
 * JJ - Excel in Dataverse
 * Author: Jeroen Jonckheer
 * License: MIT
 */

import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { App } from "./components/App";

export class Spreadsheet
  implements ComponentFramework.ReactControl<IInputs, IOutputs>
{
  private notifyOutputChanged: () => void;

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    context.mode.trackContainerResize(true);
  }

  public updateView(
    context: ComponentFramework.Context<IInputs>,
  ): React.ReactElement {
    return React.createElement(App, {
      context,
      onChange: this.notifyOutputChanged,
    });
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    // no-op
  }
}
