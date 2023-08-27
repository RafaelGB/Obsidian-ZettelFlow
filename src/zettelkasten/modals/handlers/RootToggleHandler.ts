import { AbstractHandlerClass } from "architecture/patterns";
import { StepBuilderInfo } from "../../model/StepBuilderInfoModel";

export class RootToggleHandler extends AbstractHandlerClass<StepBuilderInfo>  {
    name: string;
    description: string;
    handle(info: StepBuilderInfo): StepBuilderInfo {
        return this.goNext(info);
    }

}