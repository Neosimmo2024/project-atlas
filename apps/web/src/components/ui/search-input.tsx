import { Input, type InputProps } from "./input";

export function SearchInput(props: InputProps) {
  return <Input type="search" autoComplete="off" placeholder={props.placeholder ?? "Rechercher"} {...props} />;
}
